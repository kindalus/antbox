import { AgentNode } from "domain/ai/agent_node.ts";
import { ragAgent } from "./rag_agent.ts";

export const builtinAgents: AgentNode[] = [
	ragAgent,
];
