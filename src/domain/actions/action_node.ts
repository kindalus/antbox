import { Either, left, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { FileNodeMixin } from "../nodes/file_node.ts";
import { Folders } from "../nodes/folders.ts";
import { Node } from "../nodes/node.ts";
import { NodeFilter } from "../nodes/node_filter.ts";
import { NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";
import { ActionNodeSpec } from "./action_node_spec.ts";

export class ActionNode extends FileNodeMixin(Node) {
  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, ActionNode> {
    const node = new ActionNode(metadata);
    const trueOrrErr = ActionNodeSpec.isSatisfiedBy(node);

    if (trueOrrErr.isLeft()) {
      return left(trueOrrErr.value);
    }

    return right(node);
  }

  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  runAs?: string;
  params: string[];
  filters: NodeFilter[];
  groupsAllowed: string[];

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.ACTION_MIMETYPE,
      parent: Folders.ACTIONS_FOLDER_UUID,
    });

    this.runOnCreates = metadata.runOnCreates ?? false;
    this.runOnUpdates = metadata.runOnUpdates ?? false;
    this.runManually = metadata.runManually ?? true;
    this.runAs = metadata.runAs;
    this.params = metadata.params ?? [];
    this.filters = metadata.filters ?? [];
    this.groupsAllowed = metadata.groupsAllowed ?? [];
  }
}
