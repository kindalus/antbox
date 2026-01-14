import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import type { GroupData } from "./group_data.ts";
import type { UserData } from "./user_data.ts";
import type { ApiKeyData } from "./api_key_data.ts";
import type { AspectData } from "./aspect_data.ts";
import type { WorkflowData } from "./workflow_data.ts";
import type { WorkflowInstanceData } from "./workflow_instance_data.ts";
import type { AgentData } from "./agent_data.ts";
import type { FeatureData } from "./feature_data.ts";
import type { NotificationData } from "./notification_data.ts";
import type { AgentSkillData } from "./skill_data.ts";

/**
 * Collection mapping for type-safe repository operations
 * Maps collection names to their data types
 */
export interface CollectionMap {
	"groups": GroupData;
	"users": UserData;
	"apikeys": ApiKeyData;
	"aspects": AspectData;
	"workflows": WorkflowData;
	"workflowInstances": WorkflowInstanceData;
	"agents": AgentData;
	"features": FeatureData;
	"notifications": NotificationData;
	"skills": AgentSkillData;
}

/**
 * ConfigurationRepository - Manages all system configuration data
 * Separated from content (nodes) for performance and clarity
 */
export interface ConfigurationRepository {
	/**
	 * SAVE (Upsert):
	 * Persists the state of the object.
	 * - If the UUID exists, it updates the record.
	 * - If the UUID is new, it creates the record.
	 */
	save<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): Promise<Either<AntboxError, CollectionMap[K]>>;

	/**
	 * READ by UUID
	 */
	get<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, CollectionMap[K]>>;

	/**
	 * LIST all items in collection
	 */
	list<K extends keyof CollectionMap>(
		collection: K,
	): Promise<Either<AntboxError, CollectionMap[K][]>>;

	/**
	 * DELETE by UUID
	 */
	delete<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, void>>;
}
