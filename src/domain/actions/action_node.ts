import { Folders } from "domain/nodes/folders.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "domain/nodes/node.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import { FileMixin } from "domain/nodes/file_mixin.ts";

export class ActionNode extends FileMixin(Node) {
  #runOnCreates: boolean;
  #runOnUpdates: boolean;
  #runManually: boolean;
  #runAs?: string;
  #params: string[];
  #filters: NodeFilters;
  #groupsAllowed: string[];

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.ACTION_MIMETYPE,
      parent: Folders.ACTIONS_FOLDER_UUID,
    });

    this.#runOnCreates = metadata.runOnCreates ?? false;
    this.#runOnUpdates = metadata.runOnUpdates ?? false;
    this.#runManually = metadata.runManually ?? true;
    this.#runAs = metadata.runAs;
    this.#params = metadata.params ?? [];
    this.#filters = metadata.filters ?? [];
    this.#groupsAllowed = metadata.groupsAllowed ?? [];
  }

  get runOnCreates(): boolean {
    return this.#runOnCreates;
  }

  get runOnUpdates(): boolean {
    return this.#runOnUpdates;
  }

  get runManually(): boolean {
    return this.#runManually;
  }

  get runAs(): string | undefined {
    return this.#runAs;
  }

  get params(): string[] {
    return this.#params;
  }

  get filters(): NodeFilters {
    return this.#filters;
  }

  get groupsAllowed(): string[] {
    return this.#groupsAllowed;
  }

  override update(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, void> {
    const superUpdateResult = super.update({
      ...metadata,
      parent: Folders.ACTIONS_FOLDER_UUID,
    });

    if (superUpdateResult.isLeft()) {
      return superUpdateResult;
    }

    this.#runOnCreates = metadata.runOnCreates ?? this.#runOnCreates;
    this.#runOnUpdates = metadata.runOnUpdates ?? this.#runOnUpdates;
    this.#runManually = metadata.runManually ?? this.#runManually;
    this.#runAs = metadata.runAs ?? this.#runAs;
    this.#params = metadata.params ?? this.#params;
    this.#filters = metadata.filters ?? this.#filters;
    this.#groupsAllowed = metadata.groupsAllowed ?? this.#groupsAllowed;

    return right(undefined);
  }

  static create(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, ActionNode> {
    try {
      const node = new ActionNode(metadata);
      return right(node);
    } catch (e) {
      return left(e as ValidationError);
    }
  }
}
