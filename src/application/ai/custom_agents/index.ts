import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { AntboxAgentSdk, BaseAntboxAgent } from "./base_antbox_agent.ts";
import {
	SEMANTIC_SEARCHER_AGENT,
	SEMANTIC_SEARCHER_AGENT_UUID,
	SemanticSearcherCustomAgent,
} from "./semantic_searcher_agent.ts";

export {
	SEMANTIC_SEARCHER_AGENT,
	SEMANTIC_SEARCHER_AGENT_UUID,
} from "./semantic_searcher_agent.ts";
export type { AntboxAgentSdk } from "./base_antbox_agent.ts";
export { BaseAntboxAgent } from "./base_antbox_agent.ts";

export interface CustomAgentFactoryContext {
	readonly sdk: AntboxAgentSdk;
	readonly authContext: AuthenticationContext;
	readonly additionalInstructions?: string;
}

export interface RegisteredCustomAgent {
	readonly data: AgentData;
	create(ctx: CustomAgentFactoryContext): BaseAntboxAgent;
}

export const customAgents: AgentData[] = [SEMANTIC_SEARCHER_AGENT];

export const customAgentRegistry = new Map<string, RegisteredCustomAgent>([
	[
		SEMANTIC_SEARCHER_AGENT_UUID,
		{
			data: SEMANTIC_SEARCHER_AGENT,
			create: ({ sdk }) => new SemanticSearcherCustomAgent({ sdk }),
		},
	],
]);

export function getCustomAgent(uuid: string): RegisteredCustomAgent | undefined {
	return customAgentRegistry.get(uuid);
}
