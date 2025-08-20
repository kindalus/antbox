import { SkillParameter } from "domain/skills/skill_node.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { RunContext } from "domain/skills/skill_run_context.ts";

export interface Skill {
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
  parameters: SkillParameter[];

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

export interface SkillMetadata {
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
  parameters: SkillParameter[];
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

export function skillToNodeMetadata(
  func: Skill,
  owner?: string,
): Partial<NodeMetadata> {
  return {
    uuid: func.uuid,
    title: func.name,
    description: func.description || "",
    parent: Folders.SKILLS_FOLDER_UUID,
    mimetype: Nodes.SKILL_MIMETYPE,
    //name: func.name,
    exposeAction: func.exposeAction,
    runOnCreates: func.runOnCreates,
    runOnUpdates: func.runOnUpdates,
    runManually: func.runManually,
    filters: func.filters,
    exposeExtension: func.exposeExtension,
    exposeMCP: func.exposeMCP,
    runAs: func.runAs,
    groupsAllowed: func.groupsAllowed,
    parameters: func.parameters,
    returnType: func.returnType,
    returnDescription: func.returnDescription,
    returnContentType: func.returnContentType,
    owner: owner!,
  };
}

export async function fileToFunction(
  file: File,
): Promise<Either<AntboxError, Skill>> {
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

      const func = module.default as Skill;

      if (!func.uuid) {
        return left(new BadRequestError("Skill must have a uuid"));
      }

      if (!func.name) {
        return left(new BadRequestError("Skill must have a name"));
      }

      if (!func.run || typeof func.run !== "function") {
        return left(
          new BadRequestError("Skill must implement a run method"),
        );
      }

      return right(func);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    return left(
      new BadRequestError(
        `Failed to parse skill: ${(error as Error).message}`,
      ),
    );
  }
}
