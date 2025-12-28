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

	let [path, ...params] = cfg;
	let model: string | undefined;

	const parts = path.split("/");

	if (parts.length >= 2) {
		model = parts.pop();
		path = parts.join("/").concat(".ts");
	}

	const mod = await loadModel(path);
	if (!mod) {
		console.error("could not load model");
		Deno.exit(-1);
	}

	const modelOrErr = await (model ? mod(model, ...params) : mod());
	if (modelOrErr.isLeft()) {
		console.error("could not load model");
		console.error(modelOrErr.value);
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
