import { FeatureNode, FeatureParameter } from "domain/features/feature_node.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";

// ActionNode is an alias for FeatureNode to maintain backward compatibility
export class ActionNode extends FeatureNode {
  static override create(
    metadata: Partial<NodeMetadata> & {
      name?: string;
      exposeAction?: boolean;
      runOnCreates?: boolean;
      runOnUpdates?: boolean;
      runManually?: boolean;
      filters?: any[];
      exposeExtension?: boolean;
      exposeAITool?: boolean;
      runAs?: string;
      groupsAllowed?: string[];
      parameters?: FeatureParameter[];
      returnType?:
        | "string"
        | "number"
        | "boolean"
        | "array"
        | "object"
        | "file"
        | "void";
      returnDescription?: string;
      returnContentType?: string;
    },
  ): Either<ValidationError, ActionNode> {
    return FeatureNode.create(metadata) as Either<ValidationError, ActionNode>;
  }
}

// Export type alias for backward compatibility
export type { FeatureParameter as ActionParameter };
