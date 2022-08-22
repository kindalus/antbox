import { AspectNotFoundError } from "./../domain/aspects/aspect_not_found_error.ts";
import { AspectValidationError } from "./aspect_validation_error.ts";
import { Role } from "/domain/auth/role.ts";
import { ForbiddenError } from "/shared/ecm_error.ts";
import { Either, error, success } from "/shared/either.ts";
import { Aspect } from "/domain/aspects/aspect.ts";
import AspectRepository from "/domain/aspects/aspect_repository.ts";

import AuthService from "/application/auth_service.ts";
import webContent from "/application/builtin_aspects/web_content.ts";
import { UserPrincipal } from "./user_principal.ts";

export interface AspectServiceContext {
  readonly auth?: AuthService;
  readonly repository: AspectRepository;
}

export default class AspectService {
  private readonly context: AspectServiceContext;

  constructor(context: AspectServiceContext) {
    this.context = context;
  }

  async create(
    principal: UserPrincipal,
    aspect: Aspect
  ): Promise<Either<void, ForbiddenError | AspectValidationError>> {
    if (principal.roles.includes(Role.AspectsAdmin)) {
      return error(new ForbiddenError());
    }

    const err = this.validateAspect(aspect);

    if (err) {
      return error(err);
    }

    return success(await this.context.repository.addOrReplace(aspect));
  }

  async update(
    principal: UserPrincipal,
    uuid: string,
    aspect: Aspect
  ): Promise<
    Either<void, ForbiddenError | AspectValidationError | AspectNotFoundError>
  > {
    const existing = this.context.repository.get(uuid);

    if (!existing) {
      return error(new AspectNotFoundError(uuid));
    }

    return await this.create(principal, { ...aspect, uuid });
  }

  async delete(_principal: UserPrincipal, uuid: string): Promise<void> {
    await this.context.repository.delete(uuid);
  }

  get(principal: UserPrincipal, uuid: string): Promise<Aspect> {
    return this.context.repository.get(uuid);
  }

  list(principal: UserPrincipal): Promise<Aspect[]> {
    return this.context.repository
      .getAll()
      .then((aspects) => [webContent, ...aspects]);
  }

  private validateAspect(_aspect: Aspect): AspectValidationError | void {
    return;
  }
}
