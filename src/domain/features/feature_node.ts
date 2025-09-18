import { NodeFilter } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Node } from "domain/nodes/node.ts";
import { Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { FileMixin } from "domain/nodes/file_mixin.ts";

export interface FeatureParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "file";
  required: boolean;
  description?: string;
  defaultValue?: string | number | boolean | object | Array<unknown>;
}

export class FeatureNode extends FileMixin(Node) {
  readonly name: string;
  readonly exposeAction: boolean;
  readonly runOnCreates: boolean;
  readonly runOnUpdates: boolean;
  readonly runManually: boolean;
  readonly filters: NodeFilter[];
  readonly exposeExtension: boolean;
  readonly exposeAITool: boolean;
  readonly runAs?: string;
  readonly groupsAllowed: string[];
  readonly parameters: FeatureParameter[];
  readonly returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  readonly returnDescription?: string;
  readonly returnContentType?: string;

  constructor(
    metadata: Partial<
      NodeMetadata & {
        name?: string;
        exposeAction?: boolean;
        runOnCreates?: boolean;
        runOnUpdates?: boolean;
        runManually?: boolean;
        filters?: NodeFilter[];
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
      }
    >,
  ) {
    super(metadata);
    this.name = metadata.name || metadata.title!;
    this.exposeAction = metadata.exposeAction ?? false;
    this.runOnCreates = metadata.runOnCreates ?? false;
    this.runOnUpdates = metadata.runOnUpdates ?? false;
    this.runManually = metadata.runManually ?? true;
    this.filters = metadata.filters ?? [];
    this.exposeExtension = metadata.exposeExtension ?? false;
    this.exposeAITool = metadata.exposeAITool ?? false;
    this.runAs = metadata.runAs;
    this.groupsAllowed = metadata.groupsAllowed ?? [];
    this.parameters = metadata.parameters ?? [];
    this.returnType = metadata.returnType ?? "void";
    this.returnDescription = metadata.returnDescription;
    this.returnContentType = metadata.returnContentType;
  }

  override get metadata(): Partial<NodeMetadata> {
    return {
      ...super.metadata,
      mimetype: Nodes.FEATURE_MIMETYPE,
      // Intentionally not adding `name` to metadata as NodeMetadata schema does not include it.
      exposeAction: this.exposeAction,
      runOnCreates: this.runOnCreates,
      runOnUpdates: this.runOnUpdates,
      runManually: this.runManually,
      filters: this.filters,
      exposeExtension: this.exposeExtension,
      exposeAITool: this.exposeAITool,
      runAs: this.runAs,
      groupsAllowed: this.groupsAllowed,
      parameters: this.parameters,
      returnType: this.returnType,
      returnDescription: this.returnDescription,
      returnContentType: this.returnContentType,
    };
  }

  static create(
    metadata: Partial<NodeMetadata> & {
      name?: string;
      exposeAction?: boolean;
      runOnCreates?: boolean;
      runOnUpdates?: boolean;
      runManually?: boolean;
      filters?: NodeFilter[];
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
  ): Either<ValidationError, FeatureNode> {
    if (!metadata.name && !metadata.title) {
      return left(
        ValidationError.from(
          new AntboxError("ValidationError", "Name or title is required"),
        ),
      );
    }

    const safeMeta = {
      mimetype: Nodes.FEATURE_MIMETYPE,
      ...metadata,
    };

    try {
      const node = new FeatureNode(safeMeta);
      return right(node);
    } catch (error) {
      return left(
        ValidationError.from(
          new AntboxError("ValidationError", (error as Error).message),
        ),
      );
    }
  }
}
