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
import type { VectorDatabase } from "application/ai/vector_database.ts";
import type { AIModel } from "application/ai/ai_model.ts";
import { EmbeddingService } from "application/ai/embedding_service.ts";

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

	// Load AI components if enabled
	let vectorDatabase: VectorDatabase | undefined;
	let embeddingModel: AIModel | undefined;
	let embeddingService: EmbeddingService | undefined;

	if (cfg.ai?.enabled) {
		// Load vector database
		vectorDatabase = await providerFrom<VectorDatabase>(cfg.ai.vectorDatabase);

		// Load embedding model
		embeddingModel = await modelFrom(cfg.ai.embeddingModel);

		// Load OCR model (can be same as embedding or different)
		const ocrModel = await modelFrom(cfg.ai.ocrModel) ?? embeddingModel;

		// If we have all required AI components, set up embedding service
		if (vectorDatabase && embeddingModel && ocrModel) {
			// NodeService needs to be created first, then we'll create EmbeddingService
			// We'll do this after NodeService is created
		}
	}

	const nodeService = new NodeService({
		repository: repository ?? new InMemoryNodeRepository(),
		storage: storage ?? new InMemoryStorageProvider(),
		bus: eventBus,
		vectorDatabase,
		embeddingModel,
	});

	// Create EmbeddingService if AI is enabled
	if (cfg.ai?.enabled && vectorDatabase && embeddingModel) {
		const ocrModel = await modelFrom(cfg.ai.ocrModel) ?? embeddingModel;

		embeddingService = new EmbeddingService({
			embeddingModel,
			ocrModel,
			nodeService,
			vectorDatabase,
			bus: eventBus,
		});
	}

	const aspectService = new AspectService(nodeService);
	const usersGroupsService = new UsersGroupsService({
		repository: repository ?? new InMemoryNodeRepository(),
		storage: storage ?? new InMemoryStorageProvider(),
		bus: eventBus,
	});
	const featureService = new FeatureService(nodeService, usersGroupsService);
	const authService = new AuthService(nodeService);
	const apiKeyService = new ApiKeyService(nodeService);

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
