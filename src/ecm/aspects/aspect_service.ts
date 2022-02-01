import { Aspect } from "./aspect.ts";
import { AspectRepository } from "./aspect_repository.ts";
import { AuthService } from "../auth/auth_service.ts";
import { RequestContext } from "../request_context.ts";
import webContent from "../builtin_aspects/web_content.ts";

export interface AspectServiceContext {
	readonly auth?: AuthService;
	readonly repository: AspectRepository;
}

export default class AspectService {
	private readonly context: AspectServiceContext;

	constructor(context: AspectServiceContext) {
		this.context = context;
	}

	async create(_request: RequestContext, aspect: Aspect): Promise<void> {
		this.validateAspect(aspect);

		await this.context.repository.addOrReplace(aspect);
	}

	update(
		request: RequestContext,
		uuid: string,
		aspect: Aspect,
	): Promise<void> {
		return this.create(request, { ...aspect, uuid });
	}

	private validateAspect(_aspect: Aspect): void {}

	async delete(_request: RequestContext, uuid: string): Promise<void> {
		await this.context.repository.delete(uuid);
	}

	get(_request: RequestContext, uuid: string): Promise<Aspect> {
		return this.context.repository.get(uuid);
	}

	list(_request: RequestContext): Promise<Aspect[]> {
		return this.context.repository
			.getAll()
			.then((aspects) => [webContent, ...aspects]);
	}
}
