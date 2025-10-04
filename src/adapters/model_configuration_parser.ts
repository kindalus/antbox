import type { ModelConfiguration } from "api/http_server_configuration.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import type { AIModel } from "application/ai/ai_model.ts";

export async function modelFrom(
	cfg?: ModelConfiguration,
): Promise<AIModel | undefined> {
	if (!cfg) {
		return;
	}

	const [modelPath, ...params] = cfg;
	const mod = await loadModel(modelPath);
	if (!mod) {
		console.error("could not load model");
		Deno.exit(-1);
	}

	const modelOrErr = await mod(...params);
	if (modelOrErr.isLeft()) {
		console.error("could not load model");
		console.error(modelOrErr.value);
		Deno.exit(-1);
	}

	return modelOrErr.value;
}

async function loadModel(
	modelPath: string,
): Promise<(...p: string[]) => Promise<Either<AntboxError, AIModel>>> {
	const path = modelPath.match(/^(\.?\/|https?:\/\/)/)
		? modelPath
		: `adapters/models/${modelPath}`;

	try {
		const m = await import(path);

		if (!m.default) {
			console.error(`module [${path}] has no default export`);
			Deno.exit(-1);
		}

		return m.default;
	} catch (e) {
		console.error("could not load model");
		console.error(e);
		Deno.exit(-1);
	}
}
