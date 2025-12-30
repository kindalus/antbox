import type { ModelConfiguration } from "api/http_server_configuration.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import type { AIModel } from "application/ai/ai_model.ts";
import { Logger } from "shared/logger.ts";

/**
 * Loads and instantiates an AI model adapter from a ModelConfiguration tuple.
 *
 * @remarks
 * External setup:
 * - Ensure the model module path is resolvable (relative to `adapters/models/`).
 * - Grant Deno permissions for file or network access as required by the model.
 *
 * @param cfg Tuple of `[path, ...params]`, where `path` can include the model name.
 *
 * @example
 * const model = await modelFrom(["openai/gpt-4o-mini"]);
 */
export async function modelFrom(
	cfg?: ModelConfiguration,
): Promise<AIModel | undefined> {
	if (!cfg) {
		return;
	}

	let [path, ...params] = cfg;
	let model: string | undefined;

	const parts = path.split("/");

	if (parts.length >= 2) {
		model = parts.pop();
		path = parts.join("/").concat(".ts");
	}

	const mod = await loadModel(path);
	if (!mod) {
		Logger.error("could not load model");
		Deno.exit(-1);
	}

	const modelOrErr = await (model ? mod(model, ...params) : mod());
	if (modelOrErr.isLeft()) {
		Logger.error("could not load model");
		Logger.error(modelOrErr.value);
		Deno.exit(-1);
	}

	return modelOrErr.value;
}

async function loadModel(
	path: string,
): Promise<(...p: string[]) => Promise<Either<AntboxError, AIModel>>> {
	path = path.match(/^\.?\//) ? path : `adapters/models/${path}`;

	try {
		const m = await import(path);

		if (!m.default) {
			Logger.error(`module [${path}] has no default export`);
			Deno.exit(-1);
		}

		return m.default;
	} catch (e) {
		Logger.error("could not load model");
		Logger.error(e);
		Deno.exit(-1);
	}
}
