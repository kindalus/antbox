import ActionRepository from "/domain/actions/action_repository.ts";
import AuthService, { AuthServiceContext } from "/application/auth_service.ts";
import ActionService from "./action_service.ts";
import AspectService, { AspectServiceContext } from "./aspect_service.ts";
import NodeService, { NodeServiceContext } from "./node_service.ts";

export interface EcmConfig {
	readonly nodeServiceContext: NodeServiceContext;
	readonly aspectServiceContext: AspectServiceContext;
	readonly authServiceContext: AuthServiceContext;
	readonly actionRepository: ActionRepository;
}

export default class EcmRegistry {
	private static _instance: EcmRegistry;

	static get instance(): EcmRegistry {
		return EcmRegistry._instance;
	}

	static buildIfNone(ecmConfig: EcmConfig): EcmRegistry {
		if (!EcmRegistry._instance) EcmRegistry.build(ecmConfig);

		return EcmRegistry._instance;
	}

	static build(ecmConfig: EcmConfig): EcmRegistry {
		EcmRegistry._instance = new EcmRegistry(ecmConfig);

		return EcmRegistry._instance;
	}

	constructor(config: EcmConfig) {
		this.nodeService = new NodeService(config.nodeServiceContext);

		this.aspectService = new AspectService(
			config.aspectServiceContext,
		);

		this.authService = new AuthService(config.authServiceContext);

		this.actionService = new ActionService({
			authService: this.authService,
			nodeService: this.nodeService,
			aspectService: this.aspectService,
			repository: config.actionRepository,
		});

		if (EcmRegistry._instance) return EcmRegistry._instance;
	}

	readonly authService: AuthService;
	readonly nodeService: NodeService;
	readonly aspectService: AspectService;
	readonly actionService: ActionService;
}
