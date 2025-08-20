import { NodeFilter } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Node } from "domain/nodes/node.ts";
import { Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { RunContext } from "domain/functions/run_context.ts";
import { AntboxError } from "shared/antbox_error.ts";

export interface FunctionParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "file";
  required: boolean;
  description?: string;
  defaultValue?: string | number | boolean | object | Array<unknown>;
}

export interface Function {
  uuid: string;
  name: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  filters: NodeFilter[];

  exposeExtension: boolean;
  exposeMCP: boolean;

  runAs?: string;
  groupsAllowed: string[];
  parameters: FunctionParameter[];

  returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  returnDescription?: string;
  returnContentType?: string;

  run(
    ctx: RunContext,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

export class FunctionNode extends Node {
  readonly exposeAction: boolean;
  readonly runOnCreates: boolean;
  readonly runOnUpdates: boolean;
  readonly runManually: boolean;
  readonly filters: NodeFilter[];
  readonly exposeExtension: boolean;
  readonly exposeMCP: boolean;
  readonly runAs?: string;
  readonly groupsAllowed: string[];
  readonly parameters: FunctionParameter[];
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
        exposeAction?: boolean;
        runOnCreates?: boolean;
        runOnUpdates?: boolean;
        runManually?: boolean;
        filters?: NodeFilter[];
        exposeExtension?: boolean;
        exposeMCP?: boolean;
        runAs?: string;
        groupsAllowed?: string[];
        parameters?: FunctionParameter[];
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
    this.exposeAction = metadata.exposeAction ?? false;
    this.runOnCreates = metadata.runOnCreates ?? false;
    this.runOnUpdates = metadata.runOnUpdates ?? false;
    this.runManually = metadata.runManually ?? true;
    this.filters = metadata.filters ?? [];
    this.exposeExtension = metadata.exposeExtension ?? false;
    this.exposeMCP = metadata.exposeMCP ?? false;
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
      mimetype: Nodes.FUNCTION_MIMETYPE,
      exposeAction: this.exposeAction,
      runOnCreates: this.runOnCreates,
      runOnUpdates: this.runOnUpdates,
      runManually: this.runManually,
      filters: this.filters,
      exposeExtension: this.exposeExtension,
      exposeMCP: this.exposeMCP,
      runAs: this.runAs,
      groupsAllowed: this.groupsAllowed,
      parameters: this.parameters,
      returnType: this.returnType,
      returnDescription: this.returnDescription,
      returnContentType: this.returnContentType,
    };
  }

  static create(
    metadata: Partial<
      NodeMetadata & {
        exposeAction?: boolean;
        runOnCreates?: boolean;
        runOnUpdates?: boolean;
        runManually?: boolean;
        filters?: NodeFilter[];
        exposeExtension?: boolean;
        exposeMCP?: boolean;
        runAs?: string;
        groupsAllowed?: string[];
        parameters?: FunctionParameter[];
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
  ): Either<ValidationError, FunctionNode> {
    if (!metadata.uuid && !metadata.title) {
      return left(
        ValidationError.from(
          new AntboxError("ValidationError", "Name or title is required"),
        ),
      );
    }

    const safeMeta = {
      mimetype: Nodes.FUNCTION_MIMETYPE,
      ...metadata,
    };

    try {
      const node = new FunctionNode(safeMeta);
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
