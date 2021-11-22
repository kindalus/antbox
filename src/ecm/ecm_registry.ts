import AspectService from "./aspect_service";
import AuthService from "./auth_service";
import NodeService from "./node_service";

export interface EcmConfig {
	readonly nodeService: NodeService;
	readonly aspectService: AspectService;
	readonly authService: AuthService;
}

export default class EcmRegistry {
	private static _instance: EcmRegistry;

	static buildIfNone(ecmConfig: EcmConfig): EcmRegistry {
		if (!EcmRegistry._instance) EcmRegistry.build(ecmConfig);

		return EcmRegistry._instance;
	}

	static build(ecmConfig: EcmConfig): EcmRegistry {
		EcmRegistry._instance = new EcmRegistry(ecmConfig);

		return EcmRegistry._instance;
	}

	static get instance() {
		return EcmRegistry._instance;
	}

	static get nodeService() {
		return EcmRegistry._instance._nodeService;
	}

	static get aspectService() {
		return EcmRegistry._instance._aspectService;
	}

	static get authService() {
		return EcmRegistry._instance._authService;
	}

	constructor(config: EcmConfig) {
		this._nodeService = config.nodeService;
		this._aspectService = config.aspectService;
		this._authService = config.authService;
	}

	readonly _nodeService: NodeService;
	readonly _aspectService: AspectService;
	readonly _authService: AuthService;
}
