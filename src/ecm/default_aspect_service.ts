import { AuthService } from "./auth_service.ts";
import { AspectService } from "./aspect_service.ts";
import { Aspect } from "./aspect.ts";
import AspectRepository from "./aspect_repository.ts";
import { RequestContext } from "./request_context.ts";
import webContent from "./builtin_aspects/web_content.ts";

export interface DefaultAspectServiceContext {
  readonly auth: AuthService;
  readonly repository: AspectRepository;
}

export default class DefaultAspectService implements AspectService {
  private readonly context: DefaultAspectServiceContext;

  constructor(context: DefaultAspectServiceContext) {
    this.context = context;
  }

  async create(_request: RequestContext, aspect: Aspect): Promise<void> {
    this.validateAspect(aspect);

    await this.context.repository.addOrReplace(aspect);
  }

  update(request: RequestContext, uuid: string, aspect: Aspect): Promise<void> {
    return this.create(request, { ...aspect, uuid });
  }

  private validateAspect(_aspect: Aspect): void {}

  async delete(_request: RequestContext, uuid: string): Promise<void> {
    await this.context.repository.delete(uuid);
  }

  get(_request: RequestContext, uuid: string): Promise<Aspect> {
    return this.context.repository.get(uuid);
  }

  list(): Promise<Aspect[]> {
    return this.context.repository
      .getAll()
      .then((aspects) => [webContent, ...aspects]);
  }
}
