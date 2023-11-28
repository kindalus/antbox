import { CompositeSpecification } from "../../shared/specification.ts";
import { NodeSpec } from "../nodes/node_spec.ts";
import { ActionNode } from "./action_node.ts";

export const ActionNodeSpec = new CompositeSpecification<ActionNode>().and(NodeSpec);
