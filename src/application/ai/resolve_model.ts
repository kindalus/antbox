import type { LanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { AntboxError } from "shared/antbox_error.ts";

export interface ResolveModelOptions {
	readonly ollamaBaseUrl?: string;
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
		case "google":
			return google(id);
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
