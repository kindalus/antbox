import { CompositeSpecification, specFn } from "../../shared/specification.ts";
import { Node } from "../nodes/node.ts";
import { NodeSpec } from "../nodes/node_spec.ts";
import { ActionNode } from "./action_node.ts";

const superSpec = specFn((n: ActionNode) => NodeSpec.isSatisfiedBy(n as unknown as Node));

export const ActionNodeSpec = new CompositeSpecification<ActionNode>().and(superSpec);
