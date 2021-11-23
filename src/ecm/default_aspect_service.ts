import AuthService from "./auth_service";
import AspectService from "./aspect_service";
import Aspect from "./aspect";
import AspectRepository from "./aspect_repository";
import RequestContext from "./request_context";

export interface DefaultAspectServiceContext {
	readonly auth: AuthService;
	readonly repository: AspectRepository;
}

export default class DefaultAspectService implements AspectService {
	private readonly context: DefaultAspectServiceContext;

	constructor(context: DefaultAspectServiceContext) {
		this.context = context;
	}

	async create(request: RequestContext, aspect: Aspect): Promise<void> {
		this.validateAspect(aspect);

		await this.context.repository.addOrReplace(aspect);
	}

	async update(request: RequestContext, uuid: string, aspect: Aspect): Promise<void> {
		return this.create(request, { ...aspect, uuid });
	}

	private validateAspect(aspect: Aspect): void {}

	async delete(request: RequestContext, uuid: string): Promise<void> {
		await this.context.repository.delete(uuid);
	}

	async get(request: RequestContext, uuid: string): Promise<Aspect> {
		return this.context.repository.get(uuid);
	}

	list(): Promise<Aspect[]> {
		return this.context.repository.getAll();
	}
}
