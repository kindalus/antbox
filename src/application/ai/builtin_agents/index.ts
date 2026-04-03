import type { AgentData } from "domain/configuration/agent_data.ts";
import { ASPECT_FIELD_EXTRACTOR_AGENT } from "./aspect_field_extractor_agent.ts";
import { CODE_WRITER_AGENT } from "./code_writer_agent.ts";

export { ragAgent } from "./rag_agent.ts";
export { RAG_AGENT_UUID } from "./rag_agent.ts";
export {
	ASPECT_FIELD_EXTRACTOR_AGENT,
	ASPECT_FIELD_EXTRACTOR_AGENT_UUID,
} from "./aspect_field_extractor_agent.ts";
export { CODE_WRITER_AGENT, CODE_WRITER_AGENT_UUID } from "./code_writer_agent.ts";

export const builtinAgents: AgentData[] = [
	ASPECT_FIELD_EXTRACTOR_AGENT,
	CODE_WRITER_AGENT,
];
