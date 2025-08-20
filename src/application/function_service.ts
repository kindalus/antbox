import type { Skill } from "domain/skills/skill.ts";
import { fileToFunction, skillToNodeMetadata } from "domain/skills/skill.ts";
import { SkillNode } from "domain/skills/skill_node.ts";
import { SkillNotFoundError } from "domain/skills/skill_not_found_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import {
  AntboxError,
  BadRequestError,
  UnknownError,
} from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import { SkillDTO } from "application/skill_dto.ts";
import { RunContext } from "domain/skills/skill_run_context.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

export class SkillService {
  constructor(
    private readonly nodeService: NodeService,
    private readonly authService: UsersGroupsService,
  ) {}

  async get(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<NodeNotFoundError | SkillNotFoundError, SkillDTO>> {
    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isSkill(nodeOrErr.value)) {
      return left(new SkillNotFoundError(uuid));
    }

    const func = nodeOrErr.value;
    return right(this.#nodeToSkillDTO(func));
  }

  async list(
    ctx: AuthenticationContext,
  ): Promise<Either<AntboxError, SkillDTO[]>> {
    const nodesOrErrs = await this.nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.SKILL_MIMETYPE],
        ["parent", "==", Folders.SKILLS_FOLDER_UUID],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      return left(nodesOrErrs.value);
    }

    const nodes = nodesOrErrs.value.nodes as SkillNode[];
    const dtos = nodes.map((n) => this.#nodeToSkillDTO(n));

    return right(dtos);
  }

  async create(
    ctx: AuthenticationContext,
    file: File,
    metadata?: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, SkillDTO>> {
    const skillOrErr = await fileToFunction(file);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const func = skillOrErr.value;
    const funcMetadata = skillToNodeMetadata(func, ctx.principal.email);
    const combinedMetadata = metadata
      ? { ...funcMetadata, ...metadata }
      : funcMetadata;

    const nodeOrErr = await this.nodeService.createFile(
      ctx,
      file,
      combinedMetadata,
    );
    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return right(this.#nodeToSkillDTO(nodeOrErr.value as SkillNode));
  }

  async update(
    ctx: AuthenticationContext,
    uuid: string,
    metadata: Partial<NodeMetadata>,
  ): Promise<Either<AntboxError, SkillDTO>> {
    const skillOrErr = await this.get(ctx, uuid);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const voidOrErr = await this.nodeService.update(ctx, uuid, metadata);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    // Get the updated node to return it
    const updatedNodeOrErr = await this.nodeService.get(ctx, uuid);
    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right(
      this.#nodeToSkillDTO(updatedNodeOrErr.value as SkillNode),
    );
  }

  async updateFile(
    ctx: AuthenticationContext,
    uuid: string,
    file: File,
  ): Promise<Either<AntboxError, SkillDTO>> {
    const skillOrErr = await this.get(ctx, uuid);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const voidOrErr = await this.nodeService.updateFile(ctx, uuid, file);
    if (voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    // Get the updated node to return it
    const updatedNodeOrErr = await this.nodeService.get(ctx, uuid);
    if (updatedNodeOrErr.isLeft()) {
      return left(updatedNodeOrErr.value);
    }

    return right(
      this.#nodeToSkillDTO(updatedNodeOrErr.value as SkillNode),
    );
  }

  async delete(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, void>> {
    const skillOrErr = await this.get(ctx, uuid);

    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async run<T>(
    ctx: AuthenticationContext,
    uuid: string,
    args: Record<string, unknown>,
  ): Promise<Either<AntboxError, T>> {
    const skillOrErr = await this.#getNodeAsFunction(ctx, uuid);
    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    const func = skillOrErr.value;

    if (!func.runManually && ctx.mode === "Direct") {
      return left(new BadRequestError("Skill cannot be run manually"));
    }

    let runCtx: RunContext = {
      authenticationContext: ctx,
      nodeService: this.nodeService,
    };

    if (func.runAs) {
      const authContextOrErr = await this.#getAuthCtxByEmail(func.runAs);
      if (authContextOrErr.isRight()) {
        runCtx = {
          authenticationContext: {
            ...ctx,
            ...authContextOrErr.value,
          },
          nodeService: this.nodeService,
        };
      }
    }

    try {
      const result = await func.run(runCtx, args);
      return right(result as T);
    } catch (error) {
      return left(
        (error as AntboxError).errorCode
          ? (error as AntboxError)
          : new UnknownError((error as Error).message),
      );
    }
  }

  async export(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, File>> {
    const skillOrErr = await this.get(ctx, uuid);
    if (skillOrErr.isLeft()) {
      return left(skillOrErr.value);
    }

    return this.nodeService.export(ctx, uuid);
  }

  async #getNodeAsFunction(
    ctx: AuthenticationContext,
    uuid: string,
  ): Promise<Either<AntboxError, Skill>> {
    const nodeOrErr = await this.nodeService.get(ctx, uuid);

    if (nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    if (!Nodes.isSkill(nodeOrErr.value)) {
      return left(new SkillNotFoundError(uuid));
    }

    const fileOrErr = await this.nodeService.export(ctx, uuid);
    if (fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    return fileToFunction(fileOrErr.value);
  }

  async #getAuthCtxByEmail(
    email: string,
  ): Promise<Either<AntboxError, AuthenticationContext>> {
    const userOrErr = await this.authService.getUser(
      UsersGroupsService.elevatedContext,
      email,
    );
    if (userOrErr.isLeft()) {
      return left(userOrErr.value);
    }

    return right({
      mode: "Action",
      tenant: "default",
      principal: {
        email: userOrErr.value.email,
        groups: [userOrErr.value.group, ...userOrErr.value.groups],
      },
    });
  }

  #nodeToSkillDTO(node: SkillNode): SkillDTO {
    return {
      id: node.uuid,
      name: node.name,
      description: node.description || "",
      exposeAction: node.exposeAction,
      runOnCreates: node.runOnCreates,
      runOnUpdates: node.runOnUpdates,
      runManually: node.runManually,
      filters: node.filters,
      exposeExtension: node.exposeExtension,
      exposeMCP: node.exposeMCP,
      runAs: node.runAs,
      groupsAllowed: node.groupsAllowed,
      parameters: node.parameters,
      returnType: node.returnType,
      returnDescription: node.returnDescription,
      returnContentType: node.returnContentType,
    };
  }
}
