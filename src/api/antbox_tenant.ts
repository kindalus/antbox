import type { NodeService } from "application/node_service.ts";
import type { EmbeddingService } from "application/embedding_service.ts";
import type { VectorDatabase } from "application/vector_database.ts";
import type { RAGService } from "application/rag_service.ts";
import type { AIModel } from "application/ai_model.ts";
import type { AuditLoggingService } from "application/audit_logging_service.ts";
import type { ArticleService } from "application/article_service.ts";
import type { GroupsService } from "application/groups_service.ts";
import type { UsersService } from "application/users_service.ts";
import type { ApiKeysService } from "application/api_keys_service.ts";
import type { AspectsService } from "application/aspects_service.ts";
import type { WorkflowsService } from "application/workflows_service.ts";
import type { WorkflowInstancesService } from "application/workflow_instances_service.ts";
import type { AgentsService } from "application/agents_service.ts";
import type { FeaturesService } from "application/features_service.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";

export interface AntboxTenant {
	name: string;
	rootPasswd: string;
	rawJwk: Record<string, string>;
	symmetricKey: string;

	// Configuration Repository
	configurationRepository: ConfigurationRepository;

	// Services
	nodeService: NodeService;
	aspectsService: AspectsService;
	featuresService: FeaturesService;
	apiKeysService: ApiKeysService;
	groupsService: GroupsService;
	usersService: UsersService;
	articleService: ArticleService;
	auditLoggingService: AuditLoggingService;
	workflowsService: WorkflowsService;
	workflowInstancesService: WorkflowInstancesService;
	agentsService: AgentsService;
	embeddingService?: EmbeddingService;
	vectorDatabase?: VectorDatabase;
	ragService?: RAGService;
	defaultModel?: AIModel;
	models?: AIModel[];
}
