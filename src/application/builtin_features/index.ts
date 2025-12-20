import { fromFeature } from "domain/features/feature.ts";
import { FeatureNode } from "domain/features/feature_node.ts";
import move_up from "./move_up.ts";

export const builtinFeatures: FeatureNode[] = [
	fromFeature(move_up),
];
