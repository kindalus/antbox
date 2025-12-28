import type { NodeService } from "application/nodes/node_service.ts";
import type { EmbeddingService } from "application/ai/embedding_service.ts";
import type { RAGService } from "application/ai/rag_service.ts";
import type { AIModel } from "application/ai/ai_model.ts";
import type { AuditLoggingService } from "application/audit/audit_logging_service.ts";
import type { ArticleService } from "application/articles/article_service.ts";
import type { GroupsService } from "application/security/groups_service.ts";
import type { UsersService } from "application/security/users_service.ts";
import type { ApiKeysService } from "application/security/api_keys_service.ts";
import type { AspectsService } from "application/aspects/aspects_service.ts";
import type { WorkflowsService } from "application/workflows/workflows_service.ts";
import type { WorkflowInstancesService } from "application/workflows/workflow_instances_service.ts";
import type { WorkflowInstancesEngine } from "application/workflows/workflow_instances_engine.ts";
import type { AgentsService } from "application/ai/agents_service.ts";
import type { AgentsEngine } from "application/ai/agents_engine.ts";
import type { FeaturesService } from "application/features/features_service.ts";
import type { FeaturesEngine } from "application/features/features_engine.ts";
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
	ragService?: RAGService;
	defaultModel?: AIModel;
	models?: AIModel[];

	// Engines (execution logic)
	featuresEngine: FeaturesEngine;
	agentsEngine: AgentsEngine;
	workflowInstancesEngine: WorkflowInstancesEngine;
}
