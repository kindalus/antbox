import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { AntboxAgentSdk, BaseAntboxAgent } from "./base_antbox_agent.ts";
import { RAG_AGENT_UUID, RagAgent, ragAgent } from "application/ai/builtin_agents/rag_agent.ts";

export { RAG_AGENT_UUID, ragAgent as RAG_AGENT } from "application/ai/builtin_agents/rag_agent.ts";
export type { AntboxAgentSdk } from "./base_antbox_agent.ts";
export { BaseAntboxAgent } from "./base_antbox_agent.ts";

export interface CustomAgentFactoryContext {
	readonly sdk: AntboxAgentSdk;
	readonly authContext: AuthenticationContext;
	readonly defaultModel: string;
	readonly additionalInstructions?: string;
}

export interface RegisteredCustomAgent {
	readonly data: AgentData;
	create(ctx: CustomAgentFactoryContext): BaseAntboxAgent;
}

export const customAgents: AgentData[] = [ragAgent];

export const customAgentRegistry = new Map<string, RegisteredCustomAgent>([
	[
		RAG_AGENT_UUID,
		{
			data: ragAgent,
			create: ({ sdk, defaultModel, additionalInstructions }) =>
				new RagAgent({ sdk, defaultModel, additionalInstructions }),
		},
	],
]);

export function getCustomAgent(uuid: string): RegisteredCustomAgent | undefined {
	return customAgentRegistry.get(uuid);
}
