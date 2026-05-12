/**
 * Antbox Type Definitions
 *
 * This file contains all type definitions exported from the Antbox domain layer.
 */

export type FilterOperator =
	| "=="
	| "<="
	| ">="
	| "<"
	| ">"
	| "!="
	| "in"
	| "not-in"
	| "match"
	| "contains"
	| "contains-all"
	| "contains-any"
	| "not-contains"
	| "contains-none";

export type NodeFilter = [
	field: string,
	operator: FilterOperator,
	value: unknown,
];

export type NodeFilters1D = NodeFilter[];
export type NodeFilters2D = NodeFilters1D[];
export type NodeFilters = NodeFilters1D | NodeFilters2D;

export interface NodeFilterResult {
	pageToken: number;
	pageSize: number;
	nodes: NodeMetadata[];
	scores?: Record<string, number>;
}

export declare function isNodeFilters2D(
	filters: NodeFilters,
): filters is NodeFilters2D;

export type NodeProperties = Record<string, unknown>;

export type Permission = "Read" | "Write" | "Export";

export type Permissions = {
	group: Permission[];
	authenticated: Permission[];
	anonymous: Permission[];
	advanced: Record<string, Permission[]>;
};

export type FeatureParameterType =
	| "string"
	| "number"
	| "boolean"
	| "object"
	| "array"
	| "file";
export type FeatureParameterArrayType = "string" | "number" | "file" | "object";

export interface FeatureParameter {
	name: string;
	type: FeatureParameterType;
	arrayType?: FeatureParameterArrayType;
	contentType?: string;
	required: boolean;
	description?: string;
	defaultValue?: string | number | boolean | object | Array<unknown>;
}

export interface AspectProperty {
	/**
	 * regex /[a-zA-Z_][_a-zA-Z0-9_]{2,}/;
	 */
	name: string;
	title: string;
	type:
		| "uuid"
		| "string"
		| "number"
		| "boolean"
		| "object"
		| "array";
	arrayType?: "string" | "number" | "uuid";
	contentType?: string;
	readonly?: boolean;
	validationRegex?: string;
	validationList?: Array<string | number>;
	validationFilters?: NodeFilters;
	required?: boolean;
	searchable?: boolean;
	defaultValue?: unknown;
	default?: unknown;
}

export type AspectProperties = AspectProperty[];

export interface AspectDTO {
	uuid: string;
	title: string;
	description?: string;
	filters: NodeFilters;
	properties: AspectProperties;
	createdTime: string;
	modifiedTime: string;
}

export interface FeatureDTO {
	uuid: string;
	title: string;
	description: string;
	exposeAction: boolean;
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runOnDeletes: boolean;
	runOnEmbeddingsCreated: boolean;
	runOnEmbeddingsUpdated: boolean;
	runManually: boolean;
	filters: NodeFilters;

	exposeExtension: boolean;
	exposeAITool: boolean;

	runAs?: string;
	groupsAllowed: string[];
	parameters: FeatureParameter[];
	tags?: string[];

	returnType:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	returnDescription?: string;
	returnContentType?: string;

	run?: string;
	module?: string;
	createdTime: string;
	modifiedTime: string;
}

export interface WorkflowTransition {
	signal: string;
	targetState: string;
	filters?: NodeFilters;
	actions?: string[];
	groupsAllowed?: string[];
}

export interface WorkflowState {
	name: string;
	isInitial?: boolean;
	isFinal?: boolean;
	onEnter?: string[];
	onExit?: string[];
	transitions?: WorkflowTransition[];
}

export interface WorkflowDTO {
	uuid: string;
	title: string;
	description: string;
	owner: string;
	createdTime: string;
	modifiedTime: string;
	states: WorkflowState[];
	availableStateNames: string[];
	filters: NodeFilters;
	groupsAllowed: string[];
}
// ============================================================================
// Agent and Chat Types (from Antbox API)
// ============================================================================

export interface AgentDTO {
	uuid: string;
	name: string;
	description?: string;
	exposedToUsers: boolean;
	model?: string;
	tools?: boolean | readonly string[];
	systemPrompt?: string;
	createdTime: string;
	modifiedTime: string;
}

export interface AgentSkill {
	/** Unique identifier for the skill (same as the skill name in kebab-case) */
	uuid: string;
	/** Human-readable title for the skill */
	title: string;
	/** Brief description for skill discovery (<100 tokens) */
	description: string;
	/** Full markdown content of the skill (Level 2 + Level 3) */
	content: string;
	/** When the skill was created */
	createdTime: string;
	/** When the skill was last modified */
	modifiedTime: string;
}

export interface AgentSkillMetadata {
	/** Unique identifier for the skill (same as the skill name in kebab-case) */
	uuid: string;
	/** Brief description for skill discovery */
	description: string;
}

export interface ChatMessage {
	role: "user" | "model";
	parts: Array<{
		text?: string;
		toolCall?: {
			name: string;
			args: Record<string, unknown>;
		};
		[key: string]: unknown;
	}>;
}

// ChatHistory is just an array of ChatMessage
export type ChatHistory = ChatMessage[];

export interface ChatRequestOptions {
	temperature?: number;
	maxTokens?: number;
	history?: ChatMessage[];
}

export interface ChatRequest {
	text: string;
	options?: ChatRequestOptions;
}

export interface AnswerRequest {
	text: string;
	options?: ChatRequestOptions;
}

// ============================================================================
// Node Metadata Type (for create/update operations)
// ============================================================================

export interface NodeMetadata {
	uuid: string;
	fid: string;
	title: string;
	description?: string;
	mimetype: string;
	size?: number;
	parent: string;
	createdTime: string;
	modifiedTime: string;
	owner: string;
	aspects?: string[];
	tags?: string[];
	related?: string[];
	properties?: NodeProperties | AspectProperties;
	fulltext?: string;

	filters?: NodeFilters | string;

	group?: string;
	groups?: string[];
	email?: string;
	phone?: string;
	hasWhatsapp?: boolean;
	secret?: string;
	active?: boolean;

	onCreate?: string[];
	onUpdate?: string[];
	onDelete?: string[];
	permissions?: Permissions;

	runManually?: boolean;
	runAs?: string;
	parameters?: FeatureParameter[];
	returnType?:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	returnDescription?: string;
	returnContentType?: string;

	groupsAllowed?: string[];

	runOnCreates?: boolean;
	runOnUpdates?: boolean;
	runOnDeletes?: boolean;
	runOnEmbeddingsCreated?: boolean;
	runOnEmbeddingsUpdated?: boolean;

	exposeAction?: boolean;
	exposeExtension?: boolean;
	exposeAITool?: boolean;

	// Workflow properties
	states?: WorkflowState[];
	availableStateNames?: string[];

	// Lock properties
	locked?: boolean;
	lockedBy?: string;
	unlockAuthorizedGroups?: string[];

	// Workflow related properties
	workflowInstanceUuid?: string;
	workflowState?: string;
}

// ============================================================================
// DTOs
// ============================================================================
export interface ApiKeyDTO {
	uuid: string;
	title: string;
	group: string;
	description?: string;
	active: boolean;
	secret?: string;
	createdTime: string;
}

export interface UserDTO {
	email: string;
	title: string;
	group: string;
	groups: string[];
	phone?: string;
	hasWhatsapp?: boolean;
	createdTime: string;
	modifiedTime: string;
	active: boolean;
}

export interface UserPreferencesDTO {
	email: string;
	preferences: Record<string, unknown>;
}

export interface UpdateUserPreferencesRequest {
	preferences: Record<string, unknown>;
}

export interface GroupDTO {
	uuid: string;
	title: string;
	description?: string;
	createdTime: string;
	modifiedTime?: string;
}

// ============================================================================
// Runtime utility exports
// ============================================================================

export declare class Groups {
	static readonly ADMINS_GROUP_UUID: string;
	static readonly ANONYMOUS_GROUP_UUID: string;
}

export declare class Nodes {
	static FID_PREFIX: string;
	static ROOT_FOLDER_UUID: string;
	static FOLDER_MIMETYPE: string;
	static META_NODE_MIMETYPE: string;
	static SMART_FOLDER_MIMETYPE: string;
	static ARTICLE_MIMETYPE: string;

	static fidToUuid(fid: string): string;
	static isFid(uuid: string): boolean;
	static uuidToFid(fid: string): string;
	static isFolder(node: NodeMetadata): node is FolderNode;
	static isSmartFolder(node: NodeMetadata): node is FolderNode;
	static isFolderLike(node: NodeMetadata): node is FolderNode;
	static isMetaNode(node: NodeMetadata): node is NodeMetadata;
	static isArticle(node: NodeMetadata): node is FileNode;
	static isJavascript(file: File): boolean;
	static isFile(node: NodeMetadata): node is FileNode;
	static hasAspects(node: NodeMetadata): node is FileNode | FolderNode;
	static isFileLike(node: NodeMetadata): node is FileNode;
	static isTextPlain(node: NodeMetadata): boolean;
	static isHtml(node: NodeMetadata): boolean;
	static isMarkdown(node: NodeMetadata): boolean;
}

export declare class NodesFilters {
	static parse(value: string): Either<Error, NodeFilters>;
	static satisfiedBy(filters: NodeFilters, node: NodeMetadata): unknown;
	static nodeSpecificationFrom(filters: NodeFilters): unknown;
	private constructor();
}

export declare class Users {
	static ANONYMOUS_USER_UUID: string;
	static ANONYMOUS_USER_EMAIL: string;
	static API_KEY_USER_UUID: string;
	static API_KEY_USER_EMAIL: string;
	static ROOT_USER_UUID: string;
	static ROOT_USER_EMAIL: string;
	static LOCK_SYSTEM_USER_UUID: string;
	static LOCK_SYSTEM_USER_EMAIL: string;
	static WORKFLOW_INSTANCE_USER_UUID: string;
	static WORKFLOW_INSTANCE_USER_EMAIL: string;

	static isRoot(user: UserDTO): boolean;
	static isAdmin(user: UserDTO): boolean;
	static isAnonymous(user: UserDTO): boolean;
	static isLockSystem(user: UserDTO): boolean;
	static isWorkflowInstance(user: UserDTO): boolean;
}

// ============================================================================
// Either
// ============================================================================

export declare class Left<L, R> {
	readonly value: L;
	constructor(value: L);
	get right(): R;
	isLeft(): this is Left<L, R>;
	isRight(): this is Right<L, R>;
}

export declare class Right<L, R> {
	readonly value: R;
	constructor(value: R);
	get right(): R;
	isLeft(): this is Left<L, R>;
	isRight(): this is Right<L, R>;
}

export type Either<L, R> = Left<L, R> | Right<L, R>;

export declare const left: <L, R>(l: L) => Either<L, R>;
export declare const right: <L, R>(a: R) => Either<L, R>;

// Backward compatibility aliases
export type Agent = AgentDTO;
export type UserNode = UserDTO;
export type GroupNode = GroupDTO;
export type FileNode = NodeMetadata;
export type FolderNode = NodeMetadata;
export type WorkflowDefinition = WorkflowDTO;
export type Feature = FeatureDTO;

export interface WorkflowInstance {
	/** Unique identifier for this workflow instance (primary key) */
	uuid: string;

	/**
	 * The UUID of the workflow definition being used.
	 * References a WorkflowNode that defines the states and transitions.
	 */
	workflowDefinitionUuid: string;

	/**
	 * The UUID of the Node (file/data) being processed by this workflow.
	 */
	nodeUuid: string;

	/**
	 * The name of the current state the node is in.
	 * Must be one of the state names defined in the workflow definition.
	 */
	currentStateName: string;

	/**
	 * Recent history of transitions (optional, for quick access).
	 * This may contain only the last N transitions.
	 * Full history is stored in WorkflowTransitionHistoryRepository.
	 */
	history?: WorkflowTransitionHistory[];

	/** Whether the workflow is still running (false when a final state is reached or cancelled) */
	running: boolean;

	/** Whether this workflow instance has been cancelled */
	cancelled: boolean;

	/**
	 * List of groups allowed to view and interact with this workflow instance.
	 * If empty, all users can view and interact with it.
	 */
	groupsAllowed: string[];

	/** Email of the user who started this workflow instance */
	owner: string;

	/** Timestamp when this workflow instance was started */
	startedTime: string;
}

/**
 * Represents a single transition event in the workflow history.
 * Stored in a dedicated WorkflowTransitionHistoryRepository.
 */
export interface WorkflowTransitionHistory {
	/** The state name before the transition */
	from: string;

	/** The state name after the transition */
	to: string;

	/** The signal that triggered this transition */
	signal: string;

	/** When this transition occurred */
	timestamp: Date;

	/** The email of the user who triggered the transition */
	user: string;

	/** Optional message or comment about this transition */
	message?: string;
}

// ============================================================================
// Article Types (internationalized content)
// ============================================================================

export interface ArticleProperties {
	/** Article title */
	articleTitle: string;
	/** Friendly ID (auto-generated from articleTitle if not provided) */
	articleFid: string;
	/** Article summary/resume */
	articleResume: string;
	/** Article body content */
	articleBody: string;
}

/** A map of locale codes to ArticleProperties */
export type ArticlePropertiesMap = Record<string, ArticleProperties>;

export interface RawArticleDTO {
	/** Unique identifier for the article */
	uuid: string;
	/** Node title (auto-generated from articleTitle in pt locale if not provided) */
	title: string;
	/** Optional description */
	description?: string;
	/** Article properties organized by locale */
	properties: ArticlePropertiesMap;
	/** Article author (not localized) */
	articleAuthor: string;
	/** Parent folder UUID */
	parent: string;
	/** Creation timestamp */
	createdTime: string;
	/** Last modification timestamp */
	modifiedTime: string;
	/** Owner email */
	owner: string;
}

export interface LocalizedArticleDTO {
	/** Unique identifier for the article */
	uuid: string;
	/** Node title */
	title: string;
	/** Optional description */
	description?: string;
	/** Localized article title (selected by fallback logic) */
	articleTitle: string;
	/** Localized friendly ID (selected by fallback logic) */
	articleFid: string;
	/** Localized article summary (selected by fallback logic) */
	articleResume: string;
	/** Localized article body (selected by fallback logic) */
	articleBody: string;
	/** Article author (not localized) */
	articleAuthor: string;
	/** Parent folder UUID */
	parent: string;
	/** Creation timestamp */
	createdTime: string;
	/** Last modification timestamp */
	modifiedTime: string;
	/** Owner email */
	owner: string;
}

// ============================================================================
// Audit Types
// ============================================================================

export type AuditEventType =
	| "NodeCreatedEvent"
	| "NodeUpdatedEvent"
	| "NodeDeletedEvent";

export interface AuditEventDTO {
	/** The UUID of the node this event belongs to */
	streamId: string;
	/** Unique identifier for this event */
	eventId: string;
	/** Type of event */
	eventType: AuditEventType;
	/** When the event occurred */
	occurredOn: string;
	/** Email of the user who triggered the event */
	userEmail: string;
	/** Tenant identifier */
	tenant: string;
	/** Event-specific payload (NodeMetadata for create/delete, NodeUpdateChanges for update) */
	payload: Record<string, unknown>;
	/** Sequence number of the event in the stream (starts at 0) */
	sequence: number;
}

export interface DeletedNodeInfo {
	/** UUID of the deleted node */
	uuid: string;
	/** Title of the node (from creation event) */
	title: string;
	/** When the node was deleted */
	deletedAt: string;
	/** Email of the user who deleted the node */
	deletedBy: string;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationPriority = "CRITICAL" | "INFO" | "INSIGHT";

export interface Notification {
	/** Unique identifier for the notification */
	uuid: string;
	/** Target user email (optional if targetGroup is provided) */
	targetUser?: string;
	/** Target group UUID (optional if targetUser is provided) */
	targetGroup?: string;
	/** Priority level of the notification */
	priority: NotificationPriority;
	/** Notification title */
	title: string;
	/** Notification body/message */
	body: string;
	/** When the notification was created */
	timestamp: string;
}

export interface CreateNotificationRequest {
	/** Target user email (at least one of targetUser or targetGroup must be provided) */
	targetUser?: string;
	/** Target group UUID (at least one of targetUser or targetGroup must be provided) */
	targetGroup?: string;
	/** Notification title */
	title: string;
	/** Notification body/message */
	body: string;
}

// ============================================================================
// Documentation and Template Types
// ============================================================================

export interface DocInfo {
	/** Document identifier */
	id: string;
	/** Document title */
	title: string;
	/** Document mimetype */
	mimetype: string;
}

export interface TemplateInfo {
	/** Template identifier */
	id: string;
	/** Template title */
	title: string;
	/** Template mimetype */
	mimetype: string;
}

export interface StorageUsageMetrics {
	/** Current storage usage in gigabytes */
	totalGb: number;
	/** Storage limit in gigabytes or pay-as-you-go billing */
	limitGb: number | "pay-as-you-go";
}

export interface TokenUsageMetrics {
	/** Calendar year for the reported usage */
	year: number;
	/** Calendar month for the reported usage */
	month: number;
	/** Prompt tokens consumed in the requested month */
	promptTokens: number;
	/** Completion tokens consumed in the requested month */
	completionTokens: number;
	/** Total tokens consumed in the requested month */
	totalTokens: number;
	/** Monthly token limit in millions or pay-as-you-go billing */
	limitMillions: number | "pay-as-you-go";
}
