import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
	type Api,
	InMemoryCredentialStore,
	InMemoryModelsStore,
	type Model,
} from "@earendil-works/pi-ai";
import { AntboxError } from "shared/antbox_error.ts";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";
import type {
	ModelRuntime,
	resolveCliModel as ResolveCliModel,
} from "@earendil-works/pi-coding-agent";

export interface AgentModelRuntime {
	readonly codingRuntime?: ModelRuntime;
	readonly streamFn: StreamFn;
	resolveModel(modelString: string): Model<Api>;
	listModels(provider?: string): readonly Model<Api>[];
	getApiKey(provider: string): Promise<string | undefined>;
	isConfigured(provider: string): Promise<boolean>;
}

class PiModelRuntimeAdapter implements AgentModelRuntime {
	constructor(
		readonly codingRuntime: ModelRuntime,
		readonly resolveCliModel: typeof ResolveCliModel,
	) {}

	readonly streamFn: StreamFn = (model, context, options) =>
		this.codingRuntime.streamSimple(model, context, options);

	resolveModel(modelString: string): Model<Api> {
		try {
			const resolved = this.resolveCliModel({
				cliModel: modelString,
				modelRuntime: this.codingRuntime,
			});
			if (resolved.model) return resolved.model;
			throw new AntboxError(
				"UnknownModel",
				resolved.error ?? `Unknown Pi model '${modelString}'`,
			);
		} catch (error) {
			if (error instanceof AntboxError) throw error;
			throw new AntboxError("UnknownModel", String(error));
		}
	}

	listModels(provider?: string): readonly Model<Api>[] {
		return this.codingRuntime.getModels(provider);
	}

	async getApiKey(provider: string): Promise<string | undefined> {
		return (await this.codingRuntime.getAuth(provider))?.auth.apiKey;
	}

	async isConfigured(provider: string): Promise<boolean> {
		return await this.codingRuntime.checkAuth(provider) !== undefined;
	}
}

export async function createModelRuntime(modelsPath?: string): Promise<AgentModelRuntime> {
	const { ModelRuntime, resolveCliModel } = await loadPiCodingAgent();
	const runtime = await ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsPath: modelsPath ?? null,
		modelsStore: new InMemoryModelsStore(),
		refreshOnCreate: false,
	});
	return new PiModelRuntimeAdapter(runtime, resolveCliModel);
}
