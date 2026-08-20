import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
	type Api,
	type AuthContext,
	createModels,
	createProvider,
	type Model,
	type Models,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { AntboxError } from "shared/antbox_error.ts";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const SUPPORTED_PROVIDERS = new Set(["google", "openai", "anthropic", "ollama"]);

export interface ResolveModelOptions {
	readonly ollamaBaseUrl?: string;
	readonly googleApiKey?: string;
	readonly openaiApiKey?: string;
	readonly anthropicApiKey?: string;
	readonly env?: (name: string) => string | undefined | Promise<string | undefined>;
}

export interface AgentModelRuntime {
	readonly streamFn: StreamFn;
	resolveModel(modelString: string): Model<Api>;
	listModels(provider?: string): readonly Model<Api>[];
	getApiKey(provider: string): Promise<string | undefined>;
	isConfigured(provider: string): Promise<boolean>;
}

export class PiModelRuntime implements AgentModelRuntime {
	readonly #models: Models;
	readonly #customModels = new Map<string, Model<Api>>();

	constructor(options: ResolveModelOptions = {}) {
		const authContext = buildAuthContext(options);
		const models = createModels({ authContext });
		models.setProvider(googleProvider());
		models.setProvider(openaiProvider());
		models.setProvider(anthropicProvider());
		models.setProvider(buildOllamaProvider(options, authContext));
		this.#models = models;
	}

	readonly streamFn: StreamFn = (model, context, options) =>
		this.#models.streamSimple(model, context, options);

	resolveModel(modelString: string): Model<Api> {
		const { provider, id } = parseModelString(modelString);
		const known = this.#models.getModel(provider, id);
		if (known) return known;

		const key = `${provider}/${id}`;
		const cached = this.#customModels.get(key);
		if (cached) return cached;

		const custom = buildCustomModel(provider, id, this.#models.getProvider(provider)?.baseUrl);
		this.#customModels.set(key, custom);
		return custom;
	}

	listModels(provider?: string): readonly Model<Api>[] {
		if (provider && !SUPPORTED_PROVIDERS.has(provider)) return [];
		const catalog = this.#models.getModels(provider);
		const custom = [...this.#customModels.values()].filter((model) =>
			provider === undefined || model.provider === provider
		);
		return [...catalog, ...custom];
	}

	async getApiKey(provider: string): Promise<string | undefined> {
		if (!SUPPORTED_PROVIDERS.has(provider)) return undefined;
		const auth = await this.#models.getAuth(provider);
		return auth?.auth.apiKey;
	}

	async isConfigured(provider: string): Promise<boolean> {
		if (!SUPPORTED_PROVIDERS.has(provider)) return false;
		return (await this.#models.checkAuth(provider)) !== undefined;
	}
}

export function createModelRuntime(options: ResolveModelOptions = {}): AgentModelRuntime {
	return new PiModelRuntime(options);
}

function parseModelString(modelString: string): { provider: string; id: string } {
	const slashIndex = modelString.indexOf("/");
	if (slashIndex <= 0 || slashIndex === modelString.length - 1) {
		throw new AntboxError(
			"UnknownModelProvider",
			`Model string must be '<provider>/<model>': '${modelString}'`,
		);
	}

	const provider = modelString.slice(0, slashIndex);
	const id = modelString.slice(slashIndex + 1);
	if (!SUPPORTED_PROVIDERS.has(provider)) {
		throw new AntboxError(
			"UnknownModelProvider",
			`Unsupported model provider '${provider}' in '${modelString}'`,
		);
	}
	return { provider, id };
}

function buildAuthContext(options: ResolveModelOptions): AuthContext {
	const readEnv = async (name: string): Promise<string | undefined> => {
		const override = optionApiKey(name, options);
		if (override) return override;
		if (options.env) {
			return await options.env(name) ??
				(name === "GEMINI_API_KEY" ? await options.env("GOOGLE_API_KEY") : undefined);
		}
		return Deno.env.get(name) ??
			(name === "GEMINI_API_KEY" ? Deno.env.get("GOOGLE_API_KEY") : undefined);
	};

	return {
		env: readEnv,
		fileExists: () => Promise.resolve(false),
	};
}

function optionApiKey(name: string, options: ResolveModelOptions): string | undefined {
	switch (name) {
		case "GEMINI_API_KEY":
			return options.googleApiKey;
		case "OPENAI_API_KEY":
			return options.openaiApiKey;
		case "ANTHROPIC_API_KEY":
			return options.anthropicApiKey;
		default:
			return undefined;
	}
}

function buildOllamaProvider(options: ResolveModelOptions, authContext: AuthContext) {
	const baseUrl = options.ollamaBaseUrl ?? Deno.env.get("OLLAMA_BASE_URL") ??
		DEFAULT_OLLAMA_BASE_URL;
	return createProvider({
		id: "ollama",
		name: "Ollama",
		baseUrl,
		auth: {
			apiKey: {
				name: "Ollama local endpoint",
				resolve: async ({ signal }) => {
					signal.throwIfAborted();
					await authContext.env("OLLAMA_BASE_URL");
					return { auth: { apiKey: "ollama" }, source: "OLLAMA_BASE_URL" };
				},
			},
		},
		models: [],
		api: openAICompletionsApi(),
	});
}

function buildCustomModel(provider: string, id: string, providerBaseUrl?: string): Model<Api> {
	const api = provider === "google"
		? "google-generative-ai"
		: provider === "anthropic"
		? "anthropic-messages"
		: provider === "openai"
		? "openai-responses"
		: "openai-completions";

	return {
		id,
		name: id,
		api,
		provider,
		baseUrl: providerBaseUrl ?? DEFAULT_OLLAMA_BASE_URL,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: DEFAULT_CONTEXT_WINDOW,
		maxTokens: DEFAULT_MAX_TOKENS,
	};
}
