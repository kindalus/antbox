import type { ApiKeyService } from "application/api_key_service.ts";
import type { AspectService } from "application/aspect_service.ts";
import type { FeatureService } from "application/feature_service.ts";
import type { NodeService } from "application/node_service.ts";
import type { EmbeddingService } from "application/embedding_service.ts";
import type { VectorDatabase } from "application/vector_database.ts";
import type { AgentService } from "application/agent_service.ts";
import type { RAGService } from "application/rag_service.ts";
import type { AIModel } from "application/ai_model.ts";
import type { UsersGroupsService } from "application/users_groups_service.ts";

export interface AntboxTenant {
	name: string;
	rootPasswd: string;
	rawJwk: Record<string, string>;
	symmetricKey: string;
	nodeService: NodeService;
	aspectService: AspectService;
	featureService: FeatureService;
	apiKeyService: ApiKeyService;
	usersGroupsService: UsersGroupsService;
	embeddingService?: EmbeddingService;
	vectorDatabase?: VectorDatabase;
	agentService?: AgentService;
	ragService?: RAGService;
	defaultModel?: AIModel;
}
