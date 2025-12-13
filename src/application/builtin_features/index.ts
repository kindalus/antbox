import { fromFeature } from "domain/features/feature.ts";
import { FeatureNode } from "domain/features/feature_node.ts";
import move_up from "./move_up.ts";
export { BUILTIN_AGENT_TOOLS } from "./agent_tools.ts";

export const builtinFeatures: FeatureNode[] = [
	fromFeature(move_up),
];

// Export agent tools for use in AgentService
