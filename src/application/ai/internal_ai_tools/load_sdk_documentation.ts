import type { FeatureData, FeatureParameter } from "domain/configuration/feature_data.ts";

export type LoadSdkDocumentationFunction = (sdkName: string) => string;

/**
 * FeatureData definition for the loadSdkDocumentation tool
 */
export const LOAD_SDK_DOCUMENTATION_TOOL: Partial<FeatureData> = {
	uuid: "loadSdkDocumentation",
	title: "loadSdkDocumentation",
	description:
		"Load SDK documentation in TypeScript declaration format. Pass a SDK name ('nodes', 'aspects', 'custom') to get detailed interface documentation.",
	parameters: [
		{
			name: "sdkName",
			type: "string",
			required: true,
			description: "SDK name to get documentation for ('nodes', 'aspects', or 'custom')",
		},
	],
	returnType: "string",
};

/**
 * Factory function that creates a loadSdkDocumentation tool with bound custom features.
 *
 * @param features - List of FeatureData objects that represent custom SDK methods
 * @returns A function that returns SDK documentation in TypeScript declaration format
 */
export function createLoadSdkDocumentationTool(
	features: FeatureData[],
): LoadSdkDocumentationFunction {
	return function loadSdkDocumentation(sdkName: string): string {
		if (!sdkName) {
			return "Error: sdkName parameter is required. Available SDKs: nodes, aspects, custom";
		}

		switch (sdkName.toLowerCase()) {
			case "nodes":
				return generateNodesDocumentation();
			case "aspects":
				return generateAspectsDocumentation();
			case "custom":
				return generateCustomDocumentation(features);
			default:
				return `Unknown SDK: ${sdkName}\n\nAvailable SDKs: nodes, aspects, custom`;
		}
	};
}

function generateNodesDocumentation(): string {
	return `/**
 * =============================================================================
 * NodeServiceProxy - SDK for managing nodes in Antbox
 * =============================================================================
 *
 * Nodes are the fundamental data structure in Antbox. Everything is a node:
 * documents, folders, business entities (via aspects), users, and system objects.
 *
 * IMPORTANT: All methods return Either<Error, Result>. Always check isLeft()
 * before accessing the value.
 */
interface NodeServiceProxy {

	// =========================================================================
	// QUERY METHODS
	// =========================================================================

	/**
	 * Find nodes matching filter criteria.
	 * This is the PRIMARY method for searching and querying data.
	 *
	 * @param filters - Filter conditions (see NodeFilters type below)
	 * @param pageSize - Optional limit on results (default: all matching nodes)
	 * @param pageToken - Optional pagination token for fetching next page
	 * @returns Matching nodes and optional nextPageToken for pagination
	 *
	 * @example Find all PDF documents
	 * const result = await nodes.find([["mimetype", "==", "application/pdf"]]);
	 *
	 * @example Find nodes with a specific aspect
	 * const result = await nodes.find([["aspects", "contains", "customer-aspect-uuid"]]);
	 *
	 * @example Find by aspect property
	 * const result = await nodes.find([
	 *   ["aspects", "contains", "invoice-uuid"],
	 *   ["invoice-uuid:status", "==", "open"]
	 * ]);
	 *
	 * @example OR logic (2D array) - find open OR pending
	 * const result = await nodes.find([
	 *   [["invoice-uuid:status", "==", "open"]],
	 *   [["invoice-uuid:status", "==", "pending"]]
	 * ]);
	 *
	 * @example Semantic search (string query)
	 * const result = await nodes.find("?contract terms and conditions");
	 *
	 * @example Full-text search
	 * const result = await nodes.find([["fulltext", "match", "contract terms"]]);
	 *
	 * @example Pagination
	 * const page1 = await nodes.find(filters, 50);        // First 50 results
	 * const page2 = await nodes.find(filters, 50, page1.value.nextPageToken);
	 */
	find(
		filters: NodeFilters,
		pageSize?: number,
		pageToken?: number
	): Promise<Either<AntboxError, { nodes: NodeMetadata[], nextPageToken?: number }>>;

	/**
	 * Get a single node by its UUID.
	 * Use this when you know the exact node you need.
	 *
	 * @param uuid - The unique identifier of the node
	 * @returns The node metadata or NodeNotFoundError
	 *
	 * @example
	 * const result = await nodes.get("550e8400-e29b-41d4-a716-446655440000");
	 * if (result.isRight()) {
	 *   const node = result.value;
	 * }
	 */
	get(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * List all direct children of a parent node.
	 * Use for browsing folder contents.
	 *
	 * @param parent - UUID of the parent folder (omit for root level)
	 * @returns Array of child node metadata
	 *
	 * @example List root level nodes
	 * const result = await nodes.list();
	 *
	 * @example List children of a specific folder
	 * const result = await nodes.list("folder-uuid");
	 */
	list(parent?: string): Promise<Either<AntboxError, NodeMetadata[]>>;

	/**
	 * Get the full path from root to a node as an array of ancestors.
	 * Useful for displaying navigation breadcrumbs.
	 *
	 * @param uuid - UUID of the target node
	 * @returns Array of nodes from root to parent (excludes the node itself)
	 *
	 * @example
	 * const result = await nodes.breadcrumbs("deep-nested-node-uuid");
	 * // Returns: [root, folder1, folder2, ...] leading to the node
	 */
	breadcrumbs(uuid: string): Promise<Either<AntboxError, NodeMetadata[]>>;

	// =========================================================================
	// CREATE METHODS
	// =========================================================================

	/**
	 * Create a new node (folder, meta node, smart folder, etc.).
	 * For file uploads, use createFile() instead.
	 *
	 * @param metadata - Node properties (title required, parent defaults to root)
	 * @returns The created node metadata with generated UUID
	 *
	 * @example Create a folder
	 * const result = await nodes.create({
	 *   title: "My Folder",
	 *   mimetype: "application/vnd.antbox.folder",
	 *   parent: "parent-folder-uuid"
	 * });
	 *
	 * @example Create a business entity with aspects
	 * const result = await nodes.create({
	 *   title: "Acme Corp",
	 *   mimetype: "application/vnd.antbox.metanode",
	 *   aspects: ["customer-aspect-uuid"],
	 *   properties: {
	 *     "customer-aspect-uuid:name": "Acme Corporation",
	 *     "customer-aspect-uuid:email": "contact@acme.com"
	 *   }
	 * });
	 */
	create(metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Create a new file node with binary content.
	 *
	 * @param file - File object containing the content
	 * @param metadata - Node properties (title defaults to filename)
	 * @returns The created file node metadata
	 *
	 * @example Upload a document
	 * const file = new File([content], "report.pdf", { type: "application/pdf" });
	 * const result = await nodes.createFile(file, {
	 *   parent: "documents-folder-uuid",
	 *   tags: ["report", "2024"]
	 * });
	 */
	createFile(file: File, metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	// =========================================================================
	// UPDATE METHODS
	// =========================================================================

	/**
	 * Update a node's metadata.
	 * Only provided fields are updated; others remain unchanged.
	 *
	 * @param uuid - UUID of the node to update
	 * @param metadata - Fields to update
	 * @returns The updated node metadata
	 *
	 * @example Update title and tags
	 * const result = await nodes.update("node-uuid", {
	 *   title: "New Title",
	 *   tags: ["urgent", "reviewed"]
	 * });
	 *
	 * @example Update aspect properties
	 * const result = await nodes.update("invoice-uuid", {
	 *   properties: {
	 *     "invoice-aspect-uuid:status": "paid",
	 *     "invoice-aspect-uuid:paidDate": new Date().toISOString()
	 *   }
	 * });
	 */
	update(uuid: string, metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Replace a file node's binary content.
	 * Metadata remains unchanged unless updated separately.
	 *
	 * @param uuid - UUID of the file node
	 * @param file - New file content
	 * @returns The updated file node metadata (with new size)
	 */
	updateFile(uuid: string, file: File): Promise<Either<AntboxError, NodeMetadata>>;

	// =========================================================================
	// COPY/MOVE/DELETE METHODS
	// =========================================================================

	/**
	 * Copy a node to a different parent folder.
	 * Creates a new node with a new UUID.
	 *
	 * @param uuid - UUID of the node to copy
	 * @param parent - UUID of the destination folder
	 * @returns The new copied node metadata
	 */
	copy(uuid: string, parent: string): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Duplicate a node within the same parent folder.
	 * Creates a copy with "(Copy)" appended to the title.
	 *
	 * @param uuid - UUID of the node to duplicate
	 * @returns The new duplicated node metadata
	 */
	duplicate(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Delete a node permanently.
	 * For folders, this recursively deletes all contents.
	 *
	 * @param uuid - UUID of the node to delete
	 * @returns void on success
	 */
	delete(uuid: string): Promise<Either<AntboxError, void>>;

	// =========================================================================
	// LOCK/UNLOCK METHODS
	// =========================================================================

	/**
	 * Lock a node to prevent modifications by other users.
	 *
	 * @param uuid - UUID of the node to lock
	 * @param unlockAuthorizedGroups - Optional groups that can unlock besides owner
	 * @returns The locked node metadata
	 */
	lock(uuid: string, unlockAuthorizedGroups?: string[]): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Unlock a previously locked node.
	 * Only the lock owner or authorized groups can unlock.
	 *
	 * @param uuid - UUID of the node to unlock
	 * @returns The unlocked node metadata
	 */
	unlock(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	// =========================================================================
	// SPECIAL METHODS
	// =========================================================================

	/**
	 * Export a node's content as a downloadable file.
	 *
	 * @param uuid - UUID of the node to export
	 * @returns File object with the node's content
	 */
	export(uuid: string): Promise<Either<AntboxError, File>>;

	/**
	 * Evaluate a smart folder or trigger a feature on a node.
	 * For smart folders, returns the dynamically computed children.
	 *
	 * @param uuid - UUID of the smart folder or node
	 * @returns Evaluation result (varies by node type)
	 */
	evaluate(uuid: string): Promise<Either<AntboxError, unknown>>;
}

// =============================================================================
// NODE FILTERS - COMPREHENSIVE QUERY SYSTEM
// =============================================================================

/**
 * FILTER STRUCTURE
 * ================
 * A filter is a 3-element tuple: [field, operator, value]
 *
 * FILTER COMBINATION
 * ==================
 * - 1D Array (AND): All conditions must match
 *   [filter1, filter2, filter3] → filter1 AND filter2 AND filter3
 *
 * - 2D Array (OR): Any row can match
 *   [[row1], [row2], [row3]] → row1 OR row2 OR row3
 *   Each row is itself a 1D array with AND logic
 *
 * - String: Semantic search using AI embeddings
 *   "?search terms" → AI-powered semantic matching
 */

/**
 * FILTER OPERATORS
 * ================
 *
 * COMPARISON OPERATORS (for strings, numbers, dates):
 * ---------------------------------------------------
 * ==    Exact equality
 *       ["title", "==", "Invoice #001"]
 *       ["invoice-uuid:amount", "==", 1500.50]
 *
 * !=    Not equal
 *       ["status", "!=", "deleted"]
 *
 * <     Less than
 *       ["invoice-uuid:amount", "<", 1000]
 *       ["createdTime", "<", "2024-06-01T00:00:00Z"]
 *
 * <=    Less than or equal
 *       ["size", "<=", 10485760]  // 10MB
 *
 * >     Greater than
 *       ["invoice-uuid:amount", ">", 5000]
 *
 * >=    Greater than or equal
 *       ["createdTime", ">=", "2024-01-01T00:00:00Z"]
 *
 * TEXT SEARCH OPERATORS:
 * ----------------------
 * match    Full-text search in the fulltext field
 *          ["fulltext", "match", "contract agreement terms"]
 *          Searches within extracted document text
 *
 * SET OPERATORS (value in/not in a list):
 * ---------------------------------------
 * in       Value is one of the specified options
 *          ["invoice-uuid:status", "in", ["open", "pending", "overdue"]]
 *          ["mimetype", "in", ["application/pdf", "image/png"]]
 *
 * not-in   Value is NOT one of the specified options
 *          ["invoice-uuid:status", "not-in", ["cancelled", "deleted"]]
 *
 * ARRAY OPERATORS (for array fields like tags, aspects):
 * ------------------------------------------------------
 * contains       Array contains the value
 *                ["tags", "contains", "urgent"]
 *                ["aspects", "contains", "invoice-aspect-uuid"]
 *
 * contains-all   Array contains ALL specified values
 *                ["tags", "contains-all", ["urgent", "reviewed"]]
 *                ["aspects", "contains-all", ["invoice-uuid", "approved-uuid"]]
 *
 * contains-any   Array contains ANY of the specified values
 *                ["tags", "contains-any", ["urgent", "priority", "important"]]
 *
 * not-contains   Array does NOT contain the value
 *                ["tags", "not-contains", "archived"]
 *
 * contains-none  Array contains NONE of the specified values
 *                ["tags", "contains-none", ["deleted", "spam", "test"]]
 */
type FilterOperator =
	| "=="           // Exact equality
	| "!="           // Not equal
	| "<"            // Less than
	| "<="           // Less than or equal
	| ">"            // Greater than
	| ">="           // Greater than or equal
	| "match"        // Full-text search in fulltext field
	| "in"           // Value is in the provided array
	| "not-in"       // Value is NOT in the provided array
	| "contains"     // Array field contains the value
	| "contains-all" // Array field contains ALL values
	| "contains-any" // Array field contains ANY value
	| "not-contains" // Array field does NOT contain the value
	| "contains-none"; // Array field contains NONE of the values

/**
 * QUERYABLE FIELDS
 * ================
 *
 * CORE NODE FIELDS:
 * -----------------
 * uuid, fid, title, description, mimetype, parent, owner,
 * createdTime, modifiedTime, size, fulltext
 *
 * ARRAY FIELDS (use array operators):
 * -----------------------------------
 * tags, aspects, related
 *
 * ASPECT PROPERTY FIELDS:
 * -----------------------
 * Use format: "aspectUuid:propertyName"
 * Examples:
 *   "invoice-uuid:amount"
 *   "invoice-uuid:status"
 *   "customer-uuid:email"
 *
 * SPECIAL QUERIES:
 * ----------------
 * Semantic search: Pass a string starting with "?"
 *   "?contract terms and conditions"
 *   Uses AI embeddings for meaning-based search
 *   Cannot be combined with other filters
 */
type NodeFilter = [field: string, operator: FilterOperator, value: unknown];

/**
 * 1D Filter Array - AND Logic
 * All conditions must match for a node to be included
 *
 * @example Find large PDFs with urgent tag
 * [
 *   ["mimetype", "==", "application/pdf"],
 *   ["size", ">", 1000000],
 *   ["tags", "contains", "urgent"]
 * ]
 */
type NodeFilters1D = NodeFilter[];

/**
 * 2D Filter Array - OR Logic
 * Any row (group of AND conditions) can match
 *
 * @example Find nodes with status open OR pending
 * [
 *   [["invoice-uuid:status", "==", "open"]],
 *   [["invoice-uuid:status", "==", "pending"]]
 * ]
 *
 * @example Complex: (PDF AND large) OR (image AND tagged)
 * [
 *   [["mimetype", "==", "application/pdf"], ["size", ">", 5000000]],
 *   [["mimetype", "in", ["image/png", "image/jpeg"]], ["tags", "contains", "important"]]
 * ]
 */
type NodeFilters2D = NodeFilters1D[];

/**
 * Filter Input Types
 *
 * 1D Array: AND logic between all filters
 * 2D Array: OR logic between rows (AND within each row)
 * String:   Semantic search (must start with "?")
 */
type NodeFilters = NodeFilters1D | NodeFilters2D | string;

// =============================================================================
// COMMON QUERY PATTERNS
// =============================================================================

/**
 * FIND ALL BUSINESS ENTITIES OF A TYPE:
 * await nodes.find([["aspects", "contains", "customer-aspect-uuid"]])
 *
 * FIND BY ASPECT PROPERTY:
 * await nodes.find([
 *   ["aspects", "contains", "invoice-aspect-uuid"],
 *   ["invoice-aspect-uuid:status", "==", "open"]
 * ])
 *
 * FIND BY RELATIONSHIP (foreign key):
 * await nodes.find([
 *   ["aspects", "contains", "invoice-aspect-uuid"],
 *   ["invoice-aspect-uuid:customerId", "==", "customer-node-uuid"]
 * ])
 *
 * FIND BY DATE RANGE:
 * await nodes.find([
 *   ["createdTime", ">=", "2024-01-01T00:00:00Z"],
 *   ["createdTime", "<", "2024-02-01T00:00:00Z"]
 * ])
 *
 * FIND BY MULTIPLE POSSIBLE VALUES:
 * await nodes.find([
 *   ["invoice-uuid:status", "in", ["open", "pending", "overdue"]]
 * ])
 *
 * FULL-TEXT SEARCH:
 * await nodes.find([["fulltext", "match", "contract agreement"]])
 *
 * SEMANTIC SEARCH:
 * await nodes.find("?documents about project deadlines")
 *
 * FIND FILES BY TYPE AND SIZE:
 * await nodes.find([
 *   ["mimetype", "==", "application/pdf"],
 *   ["size", ">", 1048576]  // > 1MB
 * ])
 *
 * FIND WITH MULTIPLE TAGS:
 * await nodes.find([["tags", "contains-all", ["urgent", "reviewed"]]])
 *
 * COMPLEX OR QUERY:
 * await nodes.find([
 *   [["invoice-uuid:status", "==", "open"]],
 *   [["invoice-uuid:status", "==", "pending"]],
 *   [["invoice-uuid:status", "==", "overdue"]]
 * ])
 */

// =============================================================================
// NODE METADATA
// =============================================================================

/**
 * Complete node metadata structure.
 * All nodes share these core fields; some are type-specific.
 */
interface NodeMetadata {
	// --- Core Identity ---
	uuid: string;              // Unique identifier (primary key)
	fid: string;               // Friendly ID (alternative identifier)
	title: string;             // Display name (required)
	description?: string;      // Optional description

	// --- Type & Content ---
	mimetype: string;          // Content type (determines node type)
	size?: number;             // File size in bytes (files only)
	fulltext?: string;         // Extracted text for search (files only)

	// --- Hierarchy ---
	parent: string;            // Parent folder UUID

	// --- Timestamps ---
	createdTime: string;       // ISO 8601 creation timestamp
	modifiedTime: string;      // ISO 8601 last modification timestamp
	owner: string;             // Owner's email address

	// --- Organization ---
	tags?: string[];           // Categorization tags
	related?: string[];        // Related node UUIDs

	// --- Aspect System (Business Entities) ---
	aspects?: string[];        // Applied aspect UUIDs
	properties?: Record<string, unknown>;  // Aspect property values
	                           // Keys format: "aspectUuid:propertyName"

	// --- Security ---
	permissions?: {
		read?: string[];       // Groups with read access
		write?: string[];      // Groups with write access
		delete?: string[];     // Groups with delete access
	};
	locked?: boolean;          // Is node locked?
	lockedBy?: string;         // Email of user who locked
	unlockAuthorizedGroups?: string[];  // Groups that can unlock

	// --- Workflow ---
	workflowInstanceUuid?: string;  // Active workflow instance
	workflowState?: string;         // Current workflow state

	// --- Folder-specific ---
	group?: string;            // Default group for folder contents
	filters?: NodeFilters;     // Smart folder filter criteria
	onCreate?: string[];       // Feature UUIDs to run on child creation
	onUpdate?: string[];       // Feature UUIDs to run on child update
	onDelete?: string[];       // Feature UUIDs to run on child deletion
}

// =============================================================================
// COMMON MIMETYPES
// =============================================================================

/**
 * Special Antbox mimetypes:
 * - "application/vnd.antbox.folder"      - Regular folder
 * - "application/vnd.antbox.smartfolder" - Dynamic folder with filters
 * - "application/vnd.antbox.metanode"    - Metadata-only node (business entity)
 * - "application/vnd.antbox.article"     - Rich text article
 * - "application/vnd.antbox.aspect"      - Aspect definition
 * - "application/vnd.antbox.feature"     - Feature/action definition
 *
 * Files use standard mimetypes: "application/pdf", "image/png", etc.
 */

// =============================================================================
// ERROR HANDLING
// =============================================================================

interface AntboxError {
	name: string;     // Error type (e.g., "NodeNotFoundError", "ValidationError")
	message: string;  // Human-readable error message
}

/**
 * Either type for explicit error handling.
 *
 * @example
 * const result = await nodes.get(uuid);
 * if (result.isLeft()) {
 *   // Handle error
 *   console.error(result.value.message);
 * } else {
 *   // Use result
 *   const node = result.value;
 * }
 */
type Either<L, R> = {
	isLeft(): boolean;   // Returns true if error
	isRight(): boolean;  // Returns true if success
	value: L | R;        // Error (if left) or result (if right)
};
`;
}

function generateAspectsDocumentation(): string {
	return `/**
 * =============================================================================
 * AspectServiceProxy - SDK for managing aspects in Antbox
 * =============================================================================
 *
 * Aspects are schema definitions that transform generic nodes into structured
 * business entities. They define metadata schemas with typed properties that
 * can be applied to any node.
 *
 * Think of aspects as "types" or "classes" for business data:
 * - An "Invoice" aspect defines properties like amount, status, customer
 * - A "Customer" aspect defines properties like name, email, phone
 * - Any node can have multiple aspects applied simultaneously
 *
 * IMPORTANT: This SDK is read-only. Aspect creation/modification requires
 * admin access through the REST API.
 */
interface AspectServiceProxy {

	/**
	 * List all available aspects in the system.
	 * Use this to discover the data model and understand what business
	 * entities exist.
	 *
	 * @returns Array of all aspect definitions
	 *
	 * @example Discover available aspects
	 * const allAspects = await aspects.listAspects();
	 * // Returns: [{ uuid: "invoice-uuid", title: "Invoice", ... }, ...]
	 *
	 * @example Find aspect by title
	 * const allAspects = await aspects.listAspects();
	 * const customerAspect = allAspects.find(a => a.title === "Customer");
	 */
	listAspects(): Promise<AspectData[]>;

	/**
	 * Get a specific aspect by its UUID.
	 * Use this to examine the schema (properties) of a known aspect.
	 *
	 * @param uuid - UUID of the aspect to retrieve
	 * @returns The aspect definition or NodeNotFoundError
	 *
	 * @example Get aspect details
	 * const result = await aspects.get("invoice-aspect-uuid");
	 * if (result.isRight()) {
	 *   const aspect = result.value;
	 *   // Examine aspect.properties to understand the schema
	 * }
	 */
	get(uuid: string): Promise<Either<AntboxError, AspectData>>;
}

// =============================================================================
// ASPECT DATA STRUCTURE
// =============================================================================

/**
 * Complete aspect definition.
 * Defines the schema for a type of business entity.
 */
interface AspectData {
	// --- Identity ---
	uuid: string;              // Unique identifier
	title: string;             // Human-readable name (e.g., "Invoice", "Customer")
	description?: string;      // What this aspect represents

	// --- Schema Definition ---
	properties: AspectProperty[];  // The property schema (see below)

	// --- Optional Constraints ---
	filters?: NodeFilters;     // Limit which nodes can have this aspect

	// --- Timestamps ---
	createdTime: string;       // ISO 8601 creation timestamp
	modifiedTime: string;      // ISO 8601 last modification timestamp
}

/**
 * Property definition within an aspect.
 * Each property defines a typed field that nodes with this aspect can have.
 */
interface AspectProperty {
	// --- Identity ---
	name: string;              // Property key (e.g., "amount", "status")
	                           // Used in node properties as "aspectUuid:name"
	title: string;             // Human-readable label

	// --- Type ---
	type: AspectPropertyType;  // Data type (see below)
	arrayType?: "string" | "number" | "uuid";  // For array types
	contentType?: string;      // MIME type for file properties

	// --- Behavior ---
	readonly?: boolean;        // Cannot be modified after creation
	searchable?: boolean;      // Indexed for search
	required?: boolean;        // Must be provided when aspect is applied

	// --- Validation ---
	validationRegex?: string;       // Regex pattern for strings
	validationList?: string[];      // Allowed values (enum)
	validationFilters?: NodeFilters; // For UUID types: filter valid references

	// --- Default ---
	defaultValue?: string | number | boolean;  // Default if not provided
}

/**
 * Supported property types.
 */
type AspectPropertyType =
	| "string"    // Text value
	| "number"    // Numeric value (integer or float)
	| "boolean"   // True/false
	| "uuid"      // Reference to another node
	| "object"    // JSON object
	| "array"     // Array (see arrayType for element type)
	| "file";     // File attachment

// =============================================================================
// USAGE PATTERNS
// =============================================================================

/**
 * HOW ASPECTS WORK WITH NODES
 *
 * 1. Aspect Definition (the schema):
 *    {
 *      uuid: "invoice-aspect-uuid",
 *      title: "Invoice",
 *      properties: [
 *        { name: "amount", type: "number", required: true },
 *        { name: "status", type: "string", validationList: ["open", "paid", "cancelled"] },
 *        { name: "customerId", type: "uuid" },
 *        { name: "dueDate", type: "string" }
 *      ]
 *    }
 *
 * 2. Node with Aspect Applied (the instance):
 *    {
 *      uuid: "node-12345",
 *      title: "Invoice #001",
 *      mimetype: "application/vnd.antbox.metanode",
 *      aspects: ["invoice-aspect-uuid"],
 *      properties: {
 *        "invoice-aspect-uuid:amount": 1500.50,
 *        "invoice-aspect-uuid:status": "open",
 *        "invoice-aspect-uuid:customerId": "customer-node-uuid",
 *        "invoice-aspect-uuid:dueDate": "2024-12-31"
 *      }
 *    }
 *
 * 3. Querying by Aspect:
 *    // Find all invoices
 *    await nodes.find([["aspects", "contains", "invoice-aspect-uuid"]]);
 *
 *    // Find open invoices
 *    await nodes.find([
 *      ["aspects", "contains", "invoice-aspect-uuid"],
 *      ["invoice-aspect-uuid:status", "==", "open"]
 *    ]);
 *
 *    // Find invoices for a specific customer
 *    await nodes.find([
 *      ["aspects", "contains", "invoice-aspect-uuid"],
 *      ["invoice-aspect-uuid:customerId", "==", "customer-node-uuid"]
 *    ]);
 */

// =============================================================================
// FILTER TYPES (same as nodes SDK)
// =============================================================================

type FilterOperator =
	| "==" | "!=" | "<" | "<=" | ">" | ">="
	| "match" | "in" | "not-in"
	| "contains" | "contains-all" | "contains-any" | "not-contains" | "contains-none";

type NodeFilter = [field: string, operator: FilterOperator, value: unknown];
type NodeFilters1D = NodeFilter[];
type NodeFilters2D = NodeFilters1D[];
type NodeFilters = NodeFilters1D | NodeFilters2D | string;

// =============================================================================
// ERROR HANDLING
// =============================================================================

interface AntboxError {
	name: string;
	message: string;
}

type Either<L, R> = {
	isLeft(): boolean;
	isRight(): boolean;
	value: L | R;
};
`;
}

function generateCustomDocumentation(features: FeatureData[]): string {
	if (features.length === 0) {
		return `/**
 * =============================================================================
 * Custom SDK - User-defined features exposed as AI tools
 * =============================================================================
 *
 * No custom features are currently available.
 *
 * Custom features are server-side modules created by administrators that can
 * be exposed as AI tools. When available, they appear here with their
 * documentation.
 */
interface Custom {
	// No custom methods available
}
`;
	}

	const methods = features.map((feature) => {
		const params = feature.parameters.map((param: FeatureParameter) => {
			const optional = !param.required ? "?" : "";
			let type: string = param.type;

			if (type === "array" && param.arrayType) {
				type = `Array<${param.arrayType}>`;
			}

			const description = param.description ? ` - ${param.description}` : "";
			const defaultValue = param.defaultValue !== undefined
				? ` (default: ${JSON.stringify(param.defaultValue)})`
				: "";

			return `\t * @param ${param.name}${optional} {${type}}${description}${defaultValue}`;
		}).join("\n");

		const returnTypeMap: Record<string, string> = {
			"string": "string",
			"number": "number",
			"boolean": "boolean",
			"array": "unknown[]",
			"object": "object",
			"file": "File",
			"void": "void",
		};

		const returnType = returnTypeMap[feature.returnType] || "unknown";
		const returnDesc: string = feature.returnDescription
			? `\t * @returns ${feature.returnDescription}`
			: `\t * @returns Promise<${returnType}>`;

		const paramSignature = feature.parameters.map((param: FeatureParameter) => {
			const optional = !param.required ? "?" : "";
			let type: string = param.type;

			if (type === "array" && param.arrayType) {
				type = `Array<${param.arrayType}>`;
			}

			return `${param.name}${optional}: ${type}`;
		}).join(", ");

		return `\t/**
\t * ${feature.description || feature.title}
${params ? params + "\n" : ""}\t${returnDesc}
\t */
\t${feature.title}(${paramSignature}): Promise<${returnType}>;`;
	}).join("\n\n");

	return `/**
 * =============================================================================
 * Custom SDK - User-defined features exposed as AI tools
 * =============================================================================
 *
 * These are custom features created by administrators and exposed for AI agent
 * use. Each method corresponds to a Feature with exposeAITool: true.
 */
interface Custom {
${methods}
}
`;
}
