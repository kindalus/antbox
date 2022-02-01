import AspectService, {
	AspectServiceContext,
} from "./aspects/aspect_service.ts";
import NodeService, { NodeServiceContext } from "./nodes/node_service.ts";

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
		this.nodeService = new NodeService(config.nodeServiceContext);
		this.aspectService = new AspectService(
			config.aspectServiceContext,
		);

		if (EcmRegistry._instance) return EcmRegistry._instance;
	}

	readonly nodeService: NodeService;
	readonly aspectService: AspectService;
}
