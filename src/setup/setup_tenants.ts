import { Logger } from "shared/logger.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";

import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { ServerConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { StorageProvider } from "application/nodes/storage_provider.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import { ROOT_PASSWD } from "./server_defaults.ts";
import { providerFrom } from "adapters/module_configuration_parser.ts";
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
import { NotificationsService } from "application/notifications/notifications_service.ts";
import { UserPreferencesService } from "application/preferences/user_preferences_service.ts";
import { ExternalLoginService } from "application/security/external_login_service.ts";
import { RAGService } from "application/ai/rag_service.ts";
import { MetricsService } from "application/metrics/metrics_service.ts";
import { loadSkills } from "application/ai/skills_loader.ts";
import type { EmbeddingsProvider } from "domain/ai/embeddings_provider.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";
import { NullOCRProvider } from "adapters/ocr/null_ocr_provider.ts";

import { resolve } from "node:path";
import { fromFileUrl } from "jsr:@std/path@1.1.2";
import { registerCacheInvalidationHandlers } from "integration/webdav/webdav_cache_invalidation_handler.ts";

const BUILTIN_SKILLS_DIR = fromFileUrl(
	new URL("../application/ai/builtin_skills", import.meta.url),
);

/**
 * Builds tenant services and engines from the server configuration.
 *
 * @remarks
 * External setup:
 * - Configure repository/storage/event store adapters in `ServerConfiguration`.
 * - Ensure JWKS and symmetric key paths or URLs are reachable.
 * - Grant Deno permissions for file, env, and network access required by adapters.
 *
 * @example
 * const tenants = await setupTenants(config);
 */
export function setupTenants(
	cfg: ServerConfiguration,
): Promise<AntboxTenant[]> {
	return Promise.all(cfg.tenants.map((tenantCfg) => setupTenant(cfg, tenantCfg)));
}

async function setupTenant(
	serverCfg: ServerConfiguration,
	cfg: TenantConfiguration,
): Promise<AntboxTenant> {
	validateTenantLimits(cfg);

	const passwd = cfg.rootPasswd ?? serverCfg.rootPasswd ?? ROOT_PASSWD;
	const symmetricKey = await loadSymmetricKey(cfg.key ?? serverCfg.key);

	const externalJwks = await loadJwks(cfg.jwks ?? serverCfg.jwks);
	const nodeRepository = await providerFrom<NodeRepository>(cfg.repository);
	const storage = await providerFrom<StorageProvider>(cfg.storage);
	const eventStoreRepository = await providerFrom<EventStoreRepository>(
		cfg.eventStoreRepository,
	);
	const configRepo = await providerFrom<ConfigurationRepository>(
		cfg.configurationRepository,
	);

	// Validate all required repositories are configured
	if (!nodeRepository) {
		throw new Error(
			`Tenant ${cfg.name}: repository is required but not configured`,
		);
	}

	if (!storage) {
		throw new Error(
			`Tenant ${cfg.name}: storage is required but not configured`,
		);
	}

	if (!eventStoreRepository) {
		throw new Error(
			`Tenant ${cfg.name}: eventStoreRepository is required but not configured`,
		);
	}

	if (!configRepo) {
		throw new Error(
			`Tenant ${cfg.name}: configurationRepository is required but not configured`,
		);
	}

	const eventBus = new InMemoryEventBus();

	// Load AI providers
	let embeddingsProvider: EmbeddingsProvider | undefined;
	let ocrProvider: OCRProvider | undefined;

	if (cfg.ai?.enabled) {
		if (!cfg.ai.defaultModel) {
			Logger.error(`Tenant ${cfg.name}: AI is enabled but defaultModel is not configured`);
			Deno.exit(1);
		}

		// Load embeddings provider
		embeddingsProvider = cfg.ai.embeddingProvider
			? await providerFrom<EmbeddingsProvider>(cfg.ai.embeddingProvider)
			: undefined;

		// Load OCR provider (fall back to null provider if not configured)
		ocrProvider = cfg.ai.ocrProvider
			? await providerFrom<OCRProvider>(cfg.ai.ocrProvider)
			: new NullOCRProvider();

		// Check if repository supports embeddings
		if (embeddingsProvider && !nodeRepository.supportsEmbeddings()) {
			Logger.warn(
				`Tenant ${cfg.name}: embeddingProvider is configured but repository does not support embeddings`,
			);
		}
	}

	// Create NodeService
	const nodeService = new NodeService({
		repository: nodeRepository,
		storage,
		bus: eventBus,
		configRepo,
		embeddingsProvider,
	});

	// Create RAGService with event-driven indexing (requires embeddings support)
	let ragService: RAGService | undefined;
	if (embeddingsProvider && ocrProvider && nodeRepository.supportsEmbeddings()) {
		ragService = new RAGService(
			eventBus,
			nodeRepository,
			nodeService,
			embeddingsProvider,
			ocrProvider,
		);
	}

	// Register WebDAV cache invalidation handlers
	registerCacheInvalidationHandlers(eventBus);

	// Create configuration services
	const groupsService = new GroupsService(configRepo);
	const usersService = new UsersService(configRepo);
	const apiKeysService = new ApiKeysService(configRepo);
	const externalLoginService = new ExternalLoginService(usersService, externalJwks);
	const aspectsService = new AspectsService(configRepo);
	const workflowsService = new WorkflowsService(configRepo);

	// Create FeaturesService (CRUD only)
	const featuresService = new FeaturesService({
		configRepo,
	});

	// Create AgentsService (CRUD only)
	const agentsService = new AgentsService({
		configRepo,
	});

	// Load skill metadata (tool-based loading at runtime)
	const skills = cfg.ai?.enabled ? await loadSkills(BUILTIN_SKILLS_DIR, cfg.ai.skillsPath) : [];

	// Create AgentsEngine (execution logic)
	const agentsEngine = new AgentsEngine({
		agentsService,
		ragService,
		nodeService,
		aspectsService,
		defaultModel: cfg.ai?.defaultModel ?? "google/gemini-2.5-flash",
		skills,
		eventBus,
	});

	// Create FeaturesEngine (execution logic)
	const featuresEngine = new FeaturesEngine({
		featuresService,
		ragService,
		nodeService,
		agentsEngine,
		aspectsService,
		ocrProvider,
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

	const notificationsService = new NotificationsService(configRepo);
	const userPreferencesService = new UserPreferencesService(configRepo);

	const auditLoggingService = new AuditLoggingService(
		eventStoreRepository,
		eventBus,
	);

	const metricsService = new MetricsService(
		nodeRepository,
		eventStoreRepository,
		cfg.limits,
	);

	return {
		name: cfg.name,
		rootPasswd: passwd,
		symmetricKey,
		limits: cfg.limits,

		// Configuration Repository
		configurationRepository: configRepo,

		// Services
		agentsService,
		apiKeysService,
		articleService,
		aspectsService,
		auditLoggingService,
		externalLoginService,
		featuresService,
		groupsService,
		metricsService,
		nodeService,
		notificationsService,
		ragService,
		userPreferencesService,
		usersService,
		workflowsService,
		workflowInstancesService,

		// Engines (execution logic)
		featuresEngine,
		agentsEngine,
		workflowInstancesEngine,
	};
}

function validateTenantLimits(cfg: TenantConfiguration): void {
	if (!cfg.limits) {
		throw new Error(`Tenant ${cfg.name}: limits are required but not configured`);
	}

	const aiEnabled = cfg.ai?.enabled === true;
	const tokenLimit = cfg.limits.tokens;

	if (typeof tokenLimit === "number" && (!Number.isInteger(tokenLimit) || tokenLimit < 0)) {
		throw new Error(`Tenant ${cfg.name}: tokens limit must be a non-negative integer`);
	}

	if (!aiEnabled && tokenLimit !== 0) {
		throw new Error(`Tenant ${cfg.name}: tokens limit must be 0 when AI is disabled`);
	}

	if (aiEnabled && tokenLimit !== "pay-as-you-go" && tokenLimit <= 0) {
		throw new Error(`Tenant ${cfg.name}: tokens limit must be greater than 0 when AI is enabled`);
	}

	assertStorageLimit(cfg.name, cfg.limits);
}

function assertStorageLimit(tenantName: string, limits: TenantLimits): void {
	if (typeof limits.storage === "number" && limits.storage < 0) {
		throw new Error(`Tenant ${tenantName}: storage limit must be greater than or equal to 0`);
	}
}

async function loadJwks(
	jwksPath?: string,
): Promise<import("application/security/external_login_service.ts").ExternalJwksSource> {
	if (!jwksPath) {
		throw new Error("JWKS path is not configured");
	}

	try {
		if (jwksPath.startsWith("http://") || jwksPath.startsWith("https://")) {
			return { type: "remote", url: jwksPath };
		}

		const resolvedPath = resolve(jwksPath);
		const content = await Deno.readTextFile(resolvedPath);
		return {
			type: "local",
			jwks: JSON.parse(content),
		};
	} catch (error) {
		Logger.error(
			`JWKS loading failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		Deno.exit(-1);
	}
}

async function loadSymmetricKey(keyPath?: string): Promise<string> {
	if (!keyPath) {
		throw new Error("Symmetric key path is not configured");
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
		Logger.error(
			`Symmetric key loading failed: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
		Deno.exit(-1);
	}
}
