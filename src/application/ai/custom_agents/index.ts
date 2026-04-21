import type { AgentData } from "domain/configuration/agent_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { AntboxAgentSdk, BaseAntboxAgent } from "./base_antbox_agent.ts";

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

export const customAgents: AgentData[] = [];

export const customAgentRegistry = new Map<string, RegisteredCustomAgent>();

export function getCustomAgent(uuid: string): RegisteredCustomAgent | undefined {
	return customAgentRegistry.get(uuid);
}
