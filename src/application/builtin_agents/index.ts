import { AgentData } from "domain/configuration/agent_data.ts";
import { ragAgent } from "./rag_agent.ts";

export const builtinAgents: AgentData[] = [
	ragAgent,
];
