import Aspect from "/domain/aspects/aspect.ts";
import Principal from "/domain/auth/principal.ts";
import AspectRepository from "/domain/aspects/aspect_repository.ts";

import AuthService from "/application/auth_service.ts";
import webContent from "/application/builtin_aspects/web_content.ts";

export interface AspectServiceContext {
	readonly auth?: AuthService;
	readonly repository: AspectRepository;
}

export default class AspectService {
	private readonly context: AspectServiceContext;

	constructor(context: AspectServiceContext) {
		this.context = context;
	}

	async create(_principal: Principal, aspect: Aspect): Promise<void> {
		this.validateAspect(aspect);

		await this.context.repository.addOrReplace(aspect);
	}

	update(
		principal: Principal,
		uuid: string,
		aspect: Aspect,
	): Promise<void> {
		return this.create(principal, { ...aspect, uuid });
	}

	private validateAspect(_aspect: Aspect): void {}

	async delete(_principal: Principal, uuid: string): Promise<void> {
		await this.context.repository.delete(uuid);
	}

	get(_principal: Principal, uuid: string): Promise<Aspect> {
		return this.context.repository.get(uuid);
	}

	list(_principal: Principal): Promise<Aspect[]> {
		return this.context.repository
			.getAll()
			.then((aspects) => [webContent, ...aspects]);
	}
}
