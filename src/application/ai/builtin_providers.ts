import type { ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

const DEEPSEEK_V4_1_FLASH: Omit<ProviderModelConfig, "id"> = {
	name: "DeepSeek V4.1 Flash (Ollama Cloud)",
	reasoning: true,
	// Ollama's /api/show reports the thinking values false, low, high and max.
	thinkingLevelMap: {
		off: "none",
		minimal: null,
		low: "low",
		medium: null,
		high: "high",
		xhigh: null,
		max: "max",
	},
	input: ["text", "image"],
	// Ollama Cloud charges a subscription, not per token.
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 1048576,
	maxTokens: 65536,
	compat: {
		supportsDeveloperRole: false,
		supportsStore: false,
		maxTokensField: "max_tokens",
	},
};

/**
 * Providers that Pi's catalog lacks and that Antbox registers in every model runtime.
 * A tenant's models.json can still define a provider with the same id: its definition wins.
 */
export const BUILTIN_PROVIDERS: Readonly<Record<string, ProviderConfig>> = {
	/**
	 * Ollama's hosted models, called directly on ollama.com without a local Ollama server.
	 * Model ids are the names that https://ollama.com/v1/models lists; ollama.com also accepts
	 * the `:cloud` names that a signed-in local Ollama server uses.
	 */
	"ollama-cloud": {
		name: "Ollama Cloud",
		baseUrl: "https://ollama.com/v1",
		api: "openai-completions",
		apiKey: "$OLLAMA_API_KEY",
		models: [
			{ id: "deepseek-v4.1-flash", ...DEEPSEEK_V4_1_FLASH },
			{ id: "deepseek-v4.1-flash:cloud", ...DEEPSEEK_V4_1_FLASH },
		],
	},
};
