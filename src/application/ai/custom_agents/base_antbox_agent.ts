import type { ModelMessage } from "ai";
import type { NodeServiceProxy } from "application/nodes/node_service_proxy.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { ChatMessage, TokenUsage } from "domain/ai/chat_message.ts";

export interface AntboxAgentSdk {
	readonly nodes: NodeServiceProxy;
}

export interface AntboxAgentRunInput {
	readonly messages: ModelMessage[];
	readonly userText: string;
	readonly additionalInstructions?: string;
	readonly signal?: AbortSignal;
}

export interface AntboxAgentRunOutput {
	readonly text: string;
	readonly usage?: TokenUsage;
	readonly messages: ChatMessage[];
}

export interface BaseAntboxAgentConfig {
	readonly sdk: AntboxAgentSdk;
	readonly authContext: AuthenticationContext;
	readonly defaultModel: string;
	readonly additionalInstructions?: string;
}

export abstract class BaseAntboxAgent {
	protected readonly sdk: AntboxAgentSdk;
	protected readonly authContext: AuthenticationContext;
	protected readonly defaultModel: string;
	protected readonly additionalInstructions?: string;

	constructor(config: BaseAntboxAgentConfig) {
		this.sdk = config.sdk;
		this.authContext = config.authContext;
		this.defaultModel = config.defaultModel;
		this.additionalInstructions = config.additionalInstructions;
	}

	abstract run(input: AntboxAgentRunInput): Promise<AntboxAgentRunOutput>;
}
