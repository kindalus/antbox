import { FeatureParameter } from "domain/features/feature_node.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { RunContext } from "domain/features/feature_run_context.ts";

export interface Feature {
  uuid: string;
  name: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  filters: NodeFilter[];

  exposeExtension: boolean;
  exposeAITool: boolean;

  runAs?: string;
  groupsAllowed: string[];
  parameters: FeatureParameter[];

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

  run(ctx: RunContext, args: Record<string, unknown>): Promise<unknown>;
}

export interface FeatureMetadata {
  uuid: string;
  name: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  filters: NodeFilter[];
  exposeExtension: boolean;
  exposeAITool: boolean;
  runAs?: string;
  groupsAllowed: string[];
  parameters: FeatureParameter[];
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
}

export function featureToNodeMetadata(
  func: Feature,
  owner?: string,
): Partial<NodeMetadata> {
  return {
    uuid: func.uuid,
    title: func.name,
    description: func.description || "",
    parent: Folders.FEATURES_FOLDER_UUID,
    mimetype: Nodes.FEATURE_MIMETYPE,
    //name: func.name,
    exposeAction: func.exposeAction,
    runOnCreates: func.runOnCreates,
    runOnUpdates: func.runOnUpdates,
    runManually: func.runManually,
    filters: func.filters,
    exposeExtension: func.exposeExtension,
    exposeAITool: func.exposeAITool,
    runAs: func.runAs,
    groupsAllowed: func.groupsAllowed,
    parameters: func.parameters,
    returnType: func.returnType,
    returnDescription: func.returnDescription,
    returnContentType: func.returnContentType,
    owner: owner!,
  };
}

export async function fileToFeature(
  file: File,
): Promise<Either<AntboxError, Feature>> {
  if (file.type !== "application/javascript") {
    return left(new BadRequestError(`Invalid file type: ${file.type}`));
  }

  try {
    const text = await file.text();
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/javascript" }),
    );

    try {
      // Workaround to avoid type issues with dynamic import
      const importFunc = new globalThis.Function("url", "return import(url)");
      const module = await importFunc(url);

      if (!module.default) {
        return left(new BadRequestError("Module must have a default export"));
      }

      const func = module.default as Feature;

      if (!func.uuid) {
        return left(new BadRequestError("Feature must have a uuid"));
      }

      if (!func.name) {
        return left(new BadRequestError("Feature must have a name"));
      }

      if (!func.run || typeof func.run !== "function") {
        return left(new BadRequestError("Feature must implement a run method"));
      }

      return right(func);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    return left(
      new BadRequestError(
        `Failed to parse feature: ${(error as Error).message}`,
      ),
    );
  }
}
