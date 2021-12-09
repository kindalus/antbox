import { AspectService, AspectServiceContext } from "./aspect_service.ts";
import DefaultAspectService from "./default_aspect_service.ts";
import DefaultNodeService from "./default_node_service.ts";
import { NodeServiceContext } from "./node_service.ts";
import { NodeService } from "./node_service.ts";

export interface EcmConfig {
	readonly nodeServiceContext: NodeServiceContext;
	readonly aspectServiceContext: AspectServiceContext;
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
		this.nodeService = new DefaultNodeService(config.nodeServiceContext);
		this.aspectService = new DefaultAspectService(
			config.aspectServiceContext,
		);

		if (EcmRegistry._instance) return EcmRegistry._instance;
	}

	readonly nodeService: NodeService;
	readonly aspectService: AspectService;
}
