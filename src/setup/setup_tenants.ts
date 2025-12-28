import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";

import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { ServerConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { StorageProvider } from "application/nodes/storage_provider.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import { JWK, ROOT_PASSWD, SYMMETRIC_KEY } from "./server_defaults.ts";
import { providerFrom } from "adapters/module_configuration_parser.ts";
import { modelFrom } from "adapters/model_configuration_parser.ts";
import { FeaturesService } from "application/features/features_service.ts";
import { FeaturesEngine } from "application/features/features_engine.ts";
import { ArticleService } from "application/articles/article_service.ts";
import { AuditLoggingService } from "application/audit/audit_logging_service.ts";
import { GroupsService } from "application/security/groups_service.ts";
import { UsersService } from "application/security/users_service.ts";
import { ApiKeysService } from "application/security/api_keys_service.ts";
import { AspectsService } from "application/aspects/aspects_service.ts";
import { WorkflowsService } from "application/workflows/workflows_service.ts";
import { WorkflowInstancesService } from "application/workflows/workflow_instances_service.ts";
import { WorkflowInstancesEngine } from "application/workflows/workflow_instances_engine.ts";
import { AgentsService } from "application/ai/agents_service.ts";
import { AgentsEngine } from "application/ai/agents_engine.ts";
import type { AIModel } from "application/ai/ai_model.ts";
import { EmbeddingService } from "application/ai/embedding_service.ts";

import { RAGService } from "application/ai/rag_service.ts";

import { resolve } from "path";
import { registerCacheInvalidationHandlers } from "integration/webdav/webdav_cache_invalidation_handler.ts";

export function setupTenants(
	cfg: ServerConfiguration,
): Promise<AntboxTenant[]> {
	return Promise.all(cfg.tenants.map(setupTenant));
}

async function setupTenant(cfg: TenantConfiguration): Promise<AntboxTenant> {
	const passwd = cfg?.rootPasswd ?? ROOT_PASSWD;
	const symmetricKey = await loadSymmetricKey(cfg?.key);

	const rawJwk = await loadJwk(cfg?.jwk);
	const repository = await providerFrom<NodeRepository>(cfg?.repository);
	const storage = await providerFrom<StorageProvider>(cfg?.storage);
	const eventStoreRepository = await providerFrom<EventStoreRepository>(
		cfg?.eventStoreRepository,
	);
	const configurationRepository = await providerFrom<ConfigurationRepository>(
		cfg?.configurationRepository,
	);

	if (!eventStoreRepository) {
		throw new Error(
			`Tenant ${cfg.name}: eventStoreRepository is required but not configured`,
		);
	}

	const eventBus = new InMemoryEventBus();

	// Use configured or default ConfigurationRepository
	const configRepo = configurationRepository ?? new InMemoryConfigurationRepository();

	// Validate and load AI components FIRST if AI is enabled
	let embeddingModel: AIModel | undefined;
	let ocrModel: AIModel | undefined;
	let defaultModel: AIModel | undefined;
	let models: AIModel[] | undefined;

	const nodeRepository = repository ?? new InMemoryNodeRepository();

	if (cfg.ai && cfg.ai?.enabled) {
		// Validate all required AI configuration
		if (!cfg.ai.models?.length) {
			console.error(`Tenant ${cfg.name}: AI is enabled but no models were configured`);
			Deno.exit(1);
		}

		if (!cfg.ai.defaultModel) {
			console.error(`Tenant ${cfg.name}: AI is enabled but defaultModel is not configured`);
			Deno.exit(1);
		}

		if (!cfg.ai.embeddingModel) {
			console.error(`Tenant ${cfg.name}: AI is enabled but embeddingModel is not configured`);
			Deno.exit(1);
		}

		if (!cfg.ai.ocrModel) {
			console.error(`Tenant ${cfg.name}: AI is enabled but ocrModel is not configured`);
			Deno.exit(1);
		}

		// Check if repository supports embeddings
		if (!nodeRepository.supportsEmbeddings()) {
			console.warn(
				`Tenant ${cfg.name}: AI is enabled but the configured repository does not support embeddings`,
			);
		}

		// Load all models
		const loadedModels = await Promise.all(cfg.ai.models.map(modelFrom));

		console.info(`[${cfg.name}] Available models:`);
		console.info(JSON.stringify(loadedModels.map((m) => m?.modelName ?? "N/A"), null, 2));

		if (loadedModels.some((m) => !m)) {
			console.error(`Tenant ${cfg.name}: AI is enabled but some models failed to load`);
			Deno.exit(1);
		}

		models = loadedModels.filter((m): m is AIModel => m !== undefined);

		// Load all AI components
		defaultModel = models.find((m) => m.modelName === cfg.ai!.defaultModel);
		if (!defaultModel) {
			console.error(`Tenant ${cfg.name}: Failed to load default model`);
			Deno.exit(1);
		}

		embeddingModel = models.find((m) => m.modelName === cfg.ai!.embeddingModel);
		if (!embeddingModel) {
			console.error(`Tenant ${cfg.name}: Failed to load embedding model`);
			Deno.exit(1);
		}

		ocrModel = models.find((m) => m.modelName === cfg.ai!.ocrModel);
		if (!ocrModel) {
			console.error(`Tenant ${cfg.name}: Failed to load OCR model`);
			Deno.exit(1);
		}

		// Validate default model capabilities
		validateModelCapabilities(cfg.name, defaultModel);
	}

	// Create NodeService
	const nodeService = new NodeService({
		repository: nodeRepository,
		storage: storage ?? new InMemoryStorageProvider(),
		bus: eventBus,
		configRepo,
		embeddingModel,
	});

	// Register WebDAV cache invalidation handlers
	registerCacheInvalidationHandlers(eventBus);

	// Create configuration services
	const groupsService = new GroupsService(configRepo);
	const usersService = new UsersService(configRepo);
	const apiKeysService = new ApiKeysService(configRepo);
	const aspectsService = new AspectsService(configRepo);
	const workflowsService = new WorkflowsService(configRepo);

	// Create FeaturesService (CRUD only)
	const featuresService = new FeaturesService({
		configRepo,
	});

	// Create FeaturesEngine (execution logic)
	const featuresEngine = new FeaturesEngine({
		featuresService,
		nodeService,
		ocrModel,
		eventBus,
	});

	// Create WorkflowInstancesService (CRUD only)
	const workflowInstancesService = new WorkflowInstancesService({
		configRepo,
		workflowsService,
	});

	// Create WorkflowInstancesEngine (execution logic)
	const workflowInstancesEngine = new WorkflowInstancesEngine({
		configRepo,
		nodeService,
		workflowsService,
		workflowInstancesService,
		featuresEngine,
	});

	const articleService = new ArticleService(nodeService);

	const auditLoggingService = new AuditLoggingService(
		eventStoreRepository,
		eventBus,
	);

	// Create AgentsService (CRUD only) and AgentsEngine (execution)
	let embeddingService: EmbeddingService | undefined;
	let ragService: RAGService | undefined;

	// Create AgentsService (CRUD only)
	const agentsService = new AgentsService({
		configRepo,
		models: models ?? [],
	});

	// Create AgentsEngine (execution logic)
	const agentsEngine = new AgentsEngine({
		agentsService,
		nodeService,
		featuresService,
		aspectsService,
		models: models ?? [],
		defaultModel,
	});

	if (cfg.ai?.enabled && embeddingModel && ocrModel && defaultModel) {
		// Create EmbeddingService - uses NodeRepository for vector storage
		embeddingService = new EmbeddingService({
			embeddingModel,
			ocrModel,
			nodeService,
			repository: nodeRepository,
			bus: eventBus,
		});

		// Create RAGService - uses AgentsEngine for execution
		ragService = new RAGService(nodeService, agentsEngine);
	}

	return {
		name: cfg.name,
		rootPasswd: passwd,
		rawJwk,
		symmetricKey,

		// Configuration Repository
		configurationRepository: configRepo,

		// Services
		agentsService,
		apiKeysService,
		articleService,
		aspectsService,
		auditLoggingService,
		defaultModel,
		embeddingService,
		featuresService,
		groupsService,
		models,
		nodeService,
		ragService,
		usersService,
		workflowsService,
		workflowInstancesService,

		// Engines (execution logic)
		featuresEngine,
		agentsEngine,
		workflowInstancesEngine,
	};
}

async function loadJwk(jwkPath?: string): Promise<Record<string, string>> {
	if (!jwkPath) {
		jwkPath = JWK;
	}

	try {
		let content: string;

		// Check if jwkPath is a URL
		if (jwkPath.startsWith("http://") || jwkPath.startsWith("https://")) {
			const response = await fetch(jwkPath);
			if (!response.ok) {
				throw new Error(`Failed to fetch JWK from URL: ${response.statusText}`);
			}
			content = await response.text();
		} else {
			jwkPath = resolve(jwkPath);
			content = await Deno.readTextFile(jwkPath);
		}

		return JSON.parse(content);
	} catch (error) {
		console.error(
			`JWK loading failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		Deno.exit(-1);
	}
}

async function loadSymmetricKey(keyPath?: string): Promise<string> {
	if (!keyPath) {
		keyPath = SYMMETRIC_KEY;
	}

	// If it looks like a key value (base64), return it directly
	if (keyPath.match(/^[A-Za-z0-9+/]+=*$/)) {
		return keyPath;
	}

	try {
		keyPath = resolve(keyPath);
		const content = await Deno.readTextFile(keyPath);
		return content.trim();
	} catch (error) {
		console.error(
			`Symmetric key loading failed: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
		Deno.exit(-1);
	}
}

/**
 * Validate that the default model has required capabilities for AI agents
 */
function validateModelCapabilities(
	tenantName: string,
	model: AIModel,
) {
	// REQUIRED capabilities
	if (!model.tools) {
		console.error(
			`Tenant ${tenantName}: Default model ${model.modelName} does not support tools (required for AI agents)`,
		);
		Deno.exit(1);
	}

	if (!model.llm) {
		console.error(
			`Tenant ${tenantName}: Default model ${model.modelName} is not a valid LLM (required for AI agents)`,
		);
		Deno.exit(1);
	}

	// OPTIONAL capabilities (warn only)
	if (!model.reasoning) {
		console.warn(
			`Tenant ${tenantName}: Default model ${model.modelName} does not support reasoning - agents with reasoning flag will ignore it`,
		);
	}
}
