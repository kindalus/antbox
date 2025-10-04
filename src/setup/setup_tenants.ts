import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { ServerConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { NodeService } from "application/node_service.ts";
import type { StorageProvider } from "application/storage_provider.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { JWK, ROOT_PASSWD, SYMMETRIC_KEY } from "./server_defaults.ts";
import { providerFrom } from "adapters/module_configuration_parser.ts";
import { modelFrom } from "adapters/model_configuration_parser.ts";
import { AspectService } from "application/aspect_service.ts";
import { FeatureService } from "application/feature_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";
import { AuthService } from "application/auth_service.ts";
import { ApiKeyService } from "application/api_key_service.ts";
import type { VectorDatabase } from "application/vector_database.ts";
import type { AIModel } from "application/ai_model.ts";
import { EmbeddingService } from "application/embedding_service.ts";
import { AgentService } from "application/agent_service.ts";
import { RAGService } from "application/rag_service.ts";
import { builtinAgents } from "application/builtin_agents/index.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";

import {} from "path";
import { resolve } from "path";

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
	const eventBus = new InMemoryEventBus();

	// Validate and load AI components FIRST if AI is enabled
	let vectorDatabase: VectorDatabase | undefined;
	let embeddingModel: AIModel | undefined;
	let ocrModel: AIModel | undefined;
	let defaultModel: AIModel | undefined;

	if (cfg.ai?.enabled) {
		// Validate all required AI configuration
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

		if (!cfg.ai.vectorDatabase) {
			console.error(`Tenant ${cfg.name}: AI is enabled but vectorDatabase is not configured`);
			Deno.exit(1);
		}

		// Load all AI components
		defaultModel = await modelFrom(cfg.ai.defaultModel);
		if (!defaultModel) {
			console.error(`Tenant ${cfg.name}: Failed to load default model`);
			Deno.exit(1);
		}

		embeddingModel = await modelFrom(cfg.ai.embeddingModel);
		if (!embeddingModel) {
			console.error(`Tenant ${cfg.name}: Failed to load embedding model`);
			Deno.exit(1);
		}

		ocrModel = await modelFrom(cfg.ai.ocrModel);
		if (!ocrModel) {
			console.error(`Tenant ${cfg.name}: Failed to load OCR model`);
			Deno.exit(1);
		}

		vectorDatabase = await providerFrom<VectorDatabase>(cfg.ai.vectorDatabase);
		if (!vectorDatabase) {
			console.error(`Tenant ${cfg.name}: Failed to load vector database`);
			Deno.exit(1);
		}

		// Validate default model capabilities
		await validateModelCapabilities(cfg.name, defaultModel);
	}

	// Create NodeService
	const nodeService = new NodeService({
		repository: repository ?? new InMemoryNodeRepository(),
		storage: storage ?? new InMemoryStorageProvider(),
		bus: eventBus,
		vectorDatabase,
		embeddingModel,
	});

	// Create other core services
	const aspectService = new AspectService(nodeService);
	const usersGroupsService = new UsersGroupsService({
		repository: repository ?? new InMemoryNodeRepository(),
		storage: storage ?? new InMemoryStorageProvider(),
		bus: eventBus,
	});
	const featureService = new FeatureService(nodeService, usersGroupsService);
	const authService = new AuthService(nodeService);
	const apiKeyService = new ApiKeyService(nodeService);

	// Build AI-related services AFTER NodeService and core services
	let embeddingService: EmbeddingService | undefined;
	let agentService: AgentService | undefined;
	let ragService: RAGService | undefined;

	if (cfg.ai?.enabled && vectorDatabase && embeddingModel && ocrModel && defaultModel) {
		// Create EmbeddingService
		embeddingService = new EmbeddingService({
			embeddingModel,
			ocrModel,
			nodeService,
			vectorDatabase,
			bus: eventBus,
		});

		// Create AgentService
		agentService = new AgentService(nodeService, featureService, defaultModel);

		// Create RAGService
		ragService = new RAGService(nodeService, agentService);

		// Seed built-in agents
		await seedBuiltinAgents(cfg.name, agentService);
	}

	return {
		name: cfg.name,
		symmetricKey,
		nodeService,
		aspectService,
		featureService,
		authService,
		apiKeyService,
		rootPasswd: passwd,
		rawJwk,
		embeddingService,
		vectorDatabase,
		agentService,
		ragService,
		defaultModel,
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
async function validateModelCapabilities(
	tenantName: string,
	model: AIModel,
): Promise<void> {
	// REQUIRED capabilities
	if (!model.tools) {
		console.error(
			`Tenant ${tenantName}: Default model ${model.name} does not support tools (required for AI agents)`,
		);
		Deno.exit(1);
	}

	if (!model.files) {
		console.error(
			`Tenant ${tenantName}: Default model ${model.name} does not support file inputs (required for AI agents)`,
		);
		Deno.exit(1);
	}

	if (!model.llm) {
		console.error(
			`Tenant ${tenantName}: Default model ${model.name} is not a valid LLM (required for AI agents)`,
		);
		Deno.exit(1);
	}

	// OPTIONAL capabilities (warn only)
	if (!model.reasoning) {
		console.warn(
			`Tenant ${tenantName}: Default model ${model.name} does not support reasoning - agents with reasoning flag will ignore it`,
		);
	}
}

/**
 * Seed built-in agents into the tenant's node repository
 */
async function seedBuiltinAgents(
	tenantName: string,
	agentService: AgentService,
): Promise<void> {
	// Create root authentication context for seeding
	const rootAuthContext: AuthenticationContext = {
		tenant: tenantName,
		principal: { email: Users.ROOT_USER_EMAIL, groups: [] },
		mode: "Direct",
	};

	// Seed each built-in agent
	for (const agent of builtinAgents) {
		const result = await agentService.createOrReplace(
			rootAuthContext,
			agent.metadata,
		);

		if (result.isLeft()) {
			console.error(
				`Tenant ${tenantName}: Failed to seed built-in agent ${agent.title}: ${result.value.message}`,
			);
		} else {
			console.log(
				`Tenant ${tenantName}: Seeded built-in agent: ${agent.title} (${agent.uuid})`,
			);
		}
	}
}
