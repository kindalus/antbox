import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { AntboxError } from "shared/antbox_error.ts";

export interface ResolveModelOptions {
	readonly ollamaBaseUrl?: string;
	readonly googleApiKey?: string;
}

export function resolveModel(
	modelString: string,
	options: ResolveModelOptions = {},
): LanguageModel {
	const slashIndex = modelString.indexOf("/");
	if (slashIndex < 0) {
		throw new AntboxError(
			"UnknownModelProvider",
			`Model string must be '<provider>/<model>': '${modelString}'`,
		);
	}

	const provider = modelString.slice(0, slashIndex);
	const id = modelString.slice(slashIndex + 1);

	switch (provider) {
		case "google": {
			const apiKey = options.googleApiKey ?? Deno.env.get("GEMINI_API_KEY") ??
				Deno.env.get("GOOGLE_API_KEY");
			if (!apiKey) {
				throw new AntboxError(
					"MissingProviderApiKey",
					"Google provider requires GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment",
				);
			}
			return createGoogleGenerativeAI({ apiKey })(id);
		}
		case "openai":
			return openai(id);
		case "anthropic":
			return anthropic(id);
		case "ollama": {
			const baseURL = options.ollamaBaseUrl ?? Deno.env.get("OLLAMA_BASE_URL") ??
				"http://localhost:11434/v1";
			return createOpenAICompatible({ name: "ollama", baseURL })(id);
		}
		default:
			throw new AntboxError(
				"UnknownModelProvider",
				`Unsupported model provider '${provider}' in '${modelString}'`,
			);
	}
}
