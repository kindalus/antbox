import { BaseAgent, type BaseAgentConfig, type InvocationContext } from "@google/adk";
import type { NodeServiceProxy } from "application/nodes/node_service_proxy.ts";

export interface AntboxAgentSdk {
	readonly nodes: NodeServiceProxy;
}

export interface BaseAntboxAgentConfig extends BaseAgentConfig {
	readonly sdk: AntboxAgentSdk;
}

export abstract class BaseAntboxAgent extends BaseAgent {
	protected readonly sdk: AntboxAgentSdk;

	constructor(config: BaseAntboxAgentConfig) {
		super(config);
		this.sdk = config.sdk;
	}

	protected async *runLiveImpl(
		context: InvocationContext,
	): AsyncGenerator<import("@google/adk").Event, void, void> {
		yield* this.runAsyncImpl(context);
	}
}
