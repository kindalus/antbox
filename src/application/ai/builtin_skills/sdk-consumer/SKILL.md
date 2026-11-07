---
name: sdk-consumer
description: Full TypeScript interface documentation for the Antbox SDK (nodes and aspects). Use when writing or reviewing run_code snippets that call NodeServiceProxy or AspectServiceProxy methods.
---

You are an SDK documentation specialist with full knowledge of the Antbox platform APIs. Provide
accurate interface documentation and code examples when asked about SDK methods, parameters or
return types.

## nodes SDK

```typescript
/**
 * NodeServiceProxy — access and manage nodes in Antbox.
 * All methods return Either<AntboxError, T>. Check isLeft() before use.
 */
interface NodeServiceProxy {
	/**
	 * Find nodes by filter criteria.
	 *
	 * filters:
	 * - 1D array = AND logic, 2D array = OR logic
	 * - string starting with "?" = semantic search
	 * - other string = filter notation ("inv-uuid:status == open, size > 1000 | ...") when it
	 *   parses, otherwise a full-text search of the text (see the node-querying skill).
	 *   In notation, only unquoted numbers after <, <=, >, >= are numbers: == / != / in values and
	 *   booleans stay text, so "inv-uuid:amount == 100" or "inv-uuid:paid == true" match no
	 *   number or boolean property. Use the array form for typed values:
	 *   [["inv-uuid:amount", "==", 100]].
	 *
	 * Pagination: pageToken is the page number (default 1), pageSize defaults to 20 (max 200 over
	 * HTTP/MCP). Request pageToken + 1 for the next page; a page with fewer than pageSize nodes is
	 * the last one. scores (uuid -> relevance 0-1) is present for semantic and full-text searches.
	 *
	 * @example Semantic
	 * nodes.find("?contract renewal terms")
	 *
	 * @example AND filters
	 * nodes.find([["mimetype", "==", "application/pdf"], ["tags", "contains", "urgent"]])
	 *
	 * @example OR filters
	 * nodes.find([[["inv-uuid:status", "==", "open"]], [["inv-uuid:status", "==", "pending"]]])
	 *
	 * @example Parent folder (a field starting with "@" filters on the parent folder)
	 * nodes.find([["@title", "==", "Invoices"], ["mimetype", "==", "application/pdf"]])
	 *
	 * @example Aspect property
	 * nodes.find([["aspects", "contains", "inv-uuid"], ["inv-uuid:status", "==", "open"]])
	 *
	 * Aspect properties are not top-level fields: write them as "aspectUuid:propertyName"
	 * (or "properties.aspectUuid:propertyName"). A bare field such as "status" never matches one.
	 */
	find(
		filters: NodeFilters,
		pageSize?: number,
		pageToken?: number,
	): Promise<
		Either<
			AntboxError,
			{
				nodes: NodeMetadata[];
				pageSize: number;
				pageToken: number;
				scores?: Record<string, number>;
			}
		>
	>;

	/** Semantic search over indexed content (top 10). Left is a string when unavailable. */
	semanticQuery(text: string): Promise<Either<unknown, RagDocument[]>>;

	/** Get a single node by UUID */
	get(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/** Stored markdown (frontmatter + extracted text) keyed by readable node UUID */
	getEmbeddingContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>>;

	/** List children of a folder (omit parent for root) */
	list(parent?: string): Promise<Either<AntboxError, NodeMetadata[]>>;

	/** Breadcrumb path from root to a node */
	breadcrumbs(uuid: string): Promise<Either<AntboxError, Array<{ uuid: string; title: string }>>>;

	/** Create a non-file node (folder, metanode, smart folder) */
	create(metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	/** Create a file node with binary content */
	createFile(
		file: File,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Update node metadata (partial update — only provided fields change).
	 * Returns nothing on success: call get(uuid) to read the updated node.
	 */
	update(uuid: string, metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, void>>;

	/** Replace file binary content */
	updateFile(uuid: string, file: File): Promise<Either<AntboxError, void>>;

	/** Copy node to a different parent folder. Folders cannot be copied ("Cannot copy folder") */
	copy(uuid: string, parent: string): Promise<Either<AntboxError, NodeMetadata>>;

	/** Duplicate node in same folder (appends " 2" to the title). Not for folders */
	duplicate(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/** Delete a node permanently (recursive for folders) */
	delete(uuid: string): Promise<Either<AntboxError, void>>;

	/** Lock node against modifications */
	lock(uuid: string, unlockAuthorizedGroups?: string[]): Promise<Either<AntboxError, void>>;

	/** Unlock a previously locked node */
	unlock(uuid: string): Promise<Either<AntboxError, void>>;

	/** Export node content as a File object */
	export(uuid: string): Promise<Either<AntboxError, File>>;

	/** Export several files as one ZIP File (100 identifiers / 100 MiB max) */
	exportAll(uuids: string[]): Promise<Either<AntboxError, File>>;

	/** Evaluate a smart folder — returns its dynamic children */
	evaluate(uuid: string): Promise<Either<AntboxError, NodeMetadata[]>>;
}

interface RagDocument {
	uuid: string;
	title: string;
	content: string; // stored markdown
	score: number; // 0-1
}

type FilterOperator =
	| "=="
	| "!="
	| "<"
	| "<="
	| ">"
	| ">="
	| "match"
	| "in"
	| "not-in"
	// The contains family applies only to arrays: a non-array or missing value never satisfies
	// contains/contains-all/contains-any and always satisfies not-contains/contains-none.
	| "contains"
	| "contains-all"
	| "contains-any"
	| "not-contains"
	| "contains-none";

type NodeFilter = [field: string, operator: FilterOperator, value: unknown];
type NodeFilters1D = NodeFilter[];
type NodeFilters2D = NodeFilters1D[];
type NodeFilters = NodeFilters1D | NodeFilters2D | string;

type Permission = "Read" | "Write" | "Export";

// Node results (find, get, list, ...) expose these fields directly and serialize to this shape.
interface NodeMetadata {
	uuid: string;
	fid: string;
	title: string;
	description?: string;
	mimetype: string;
	size?: number; // bytes, file nodes only
	parent: string;
	createdTime: string; // ISO 8601
	modifiedTime: string; // ISO 8601
	owner: string; // email
	tags?: string[];
	related?: string[];
	aspects?: string[];
	properties?: Record<string, unknown>; // keys: "aspectUuid:propertyName"
	locked?: boolean;
	lockedBy?: string;
	unlockAuthorizedGroups?: string[];
	workflowInstanceUuid?: string;
	workflowState?: string;
	// Folder-specific
	permissions?: {
		group: Permission[];
		authenticated: Permission[];
		anonymous: Permission[];
		advanced: Record<string, Permission[]>; // group uuid -> permissions
	};
	group?: string;
	filters?: NodeFilters; // also smart folders (required there)
	onCreate?: string[];
	onUpdate?: string[];
	onDelete?: string[];
	onEmbeddingsCreated?: string[]; // after a child's first embeddings are stored
	onEmbeddingsUpdated?: string[]; // after a child's embeddings are refreshed
	// Article-specific
	articleProperties?: Record<
		string, // locale
		{ articleTitle: string; articleFid: string; articleResume: string; articleBody: string }
	>;
	articleAuthor?: string;
	articleBodyContentType?: "markdown" | "html" | "text";
}
```

## aspects SDK

```typescript
/**
 * AspectServiceProxy — read aspect schema definitions.
 * Read-only. Aspects are configuration records, not nodes. Admins create or replace them over
 * REST with POST /v2/aspects/-/upload; there is no update endpoint. Re-uploading an aspect with
 * the same uuid replaces it and resets its createdTime.
 */
interface AspectServiceProxy {
	/**
	 * List all aspects defined in the system, sorted by title.
	 * Use this to discover the data model before querying by aspect properties.
	 *
	 * @example
	 * const allOrErr = await aspects.listAspects();
	 * if (allOrErr.isLeft()) return JSON.stringify({ error: allOrErr.value.message });
	 * const inv = allOrErr.value.find(a => a.title === "Invoice");
	 */
	listAspects(): Promise<Either<AntboxError, AspectData[]>>;

	/** Get a specific aspect by UUID */
	get(uuid: string): Promise<Either<AntboxError, AspectData>>;
}

interface AspectData {
	// From the uploaded JSON "uuid", else the file name without extension, spaces -> "-".
	// Must match /^([a-z][a-z0-9-]{3,}|--[a-z][a-z0-9-]+--)$/; the --name-- form is the built-in
	// convention, do not use it for custom aspects.
	uuid: string;
	title: string; // at least 3 characters
	description?: string;
	properties: AspectProperty[];
	// Required ([] when omitted on upload). Arrays only, no filter strings, no "fulltext".
	// "@field" conditions read the node's parent folder, as in searches (also in folder, feature
	// and workflow filters), e.g. [["@aspects", "contains", "reseller"]].
	filters: NodeFilters1D | NodeFilters2D;
	createdTime: string;
	modifiedTime: string;
}

interface AspectProperty {
	name: string; // kebab-case /^[a-z][a-z0-9-]{2,}$/; key in node.properties is "aspectUuid:name"
	title: string; // human-readable label
	type: "uuid" | "string" | "number" | "boolean" | "object" | "array" | "date";
	arrayType?: "string" | "number" | "uuid";
	contentType?: string;
	// Write-once: settable on create or on any update while nothing is stored; once a value is
	// stored, later writes are silently discarded (the stored value is kept).
	readonly?: boolean;
	searchable?: boolean;
	required?: boolean;
	validationRegex?: string; // string and array<string> only; upload rejects an invalid JS regex
	validationList?: Array<string | number>; // string, number, array<string> only; strict type match
	// uuid and array<uuid> only, checked against the referenced nodes. Arrays only, no
	// "fulltext"; "@" fields are checked against each referenced node's parent folder.
	validationFilters?: NodeFilters1D | NodeFilters2D;
	// Used when the value is missing, null or "" (non-string types). Upload rejects a default that
	// breaks the property's type, validationList or validationRegex (so none for array/object).
	defaultValue?: string | number | boolean;
}
// In a non-string property, "" means no value, like null: it is removed or replaced by
// defaultValue, and fails `required`. A string property keeps "". Upload rejects duplicate
// property names and drops keys not listed above.
```

## Common Types

```typescript
interface AntboxError {
	name: string;
	message: string;
}

type Either<L, R> = {
	isLeft(): boolean; // true when error
	isRight(): boolean; // true when success
	value: L | R;
};
```

## Special Mimetypes

| Mimetype                             | Node type                            |
| ------------------------------------ | ------------------------------------ |
| `application/vnd.antbox.folder`      | Regular folder                       |
| `application/vnd.antbox.smartfolder` | Dynamic folder with filters          |
| `application/vnd.antbox.metanode`    | Metadata-only node (business entity) |
| `application/vnd.antbox.article`     | Rich text article                    |

Aspects, features, agents and workflows are configuration records, not nodes, so they have no
node mimetype.

## run_code Template

```javascript
export default async function ({ nodes, aspects }) {
	// 1. Discover data model (when working with aspects)
	const aspectsOrErr = await aspects.listAspects();
	if (aspectsOrErr.isLeft()) return JSON.stringify({ error: aspectsOrErr.value.message });
	const target = aspectsOrErr.value.find((a) => a.title.includes("Invoice"));
	if (!target) return JSON.stringify({ error: "Aspect not found" });

	// 2. Query
	const result = await nodes.find([
		["aspects", "contains", target.uuid],
		[`${target.uuid}:status`, "==", "open"],
	]);

	// 3. Always check for errors
	if (result.isLeft()) return JSON.stringify({ error: result.value.message });

	return JSON.stringify({ count: result.value.nodes.length, nodes: result.value.nodes });
}
```
