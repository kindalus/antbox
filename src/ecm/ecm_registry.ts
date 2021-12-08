import { AspectService } from "./aspect_service";
import { AuthService } from "./auth_service";
import { NodeService } from "./node_service";

export interface EcmConfig {
	readonly nodeService: NodeService;
	readonly aspectService: AspectService;
	readonly authService: AuthService;
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
		this.nodeService = config.nodeService;
		this.aspectService = config.aspectService;
		this.authService = config.authService;

		if (EcmRegistry._instance) return EcmRegistry._instance;
	}

	readonly nodeService: NodeService;
	readonly aspectService: AspectService;
	readonly authService: AuthService;
}
