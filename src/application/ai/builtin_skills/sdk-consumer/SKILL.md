---
name: sdk-consumer
description: Full TypeScript interface documentation for the Antbox SDK (nodes and aspects). Use when writing or reviewing runCode snippets that call NodeServiceProxy or AspectServiceProxy methods.
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
	 * filters: 1D array = AND logic, 2D array = OR logic, string starting with "?" = semantic search
	 *
	 * @example Semantic
	 * nodes.find("?contract renewal terms")
	 *
	 * @example AND filters
	 * nodes.find([["mimetype", "==", "application/pdf"], ["tags", "contains", "urgent"]])
	 *
	 * @example OR filters
	 * nodes.find([[["status", "==", "open"]], [["status", "==", "pending"]]])
	 *
	 * @example Aspect property
	 * nodes.find([["aspects", "contains", "inv-uuid"], ["inv-uuid:status", "==", "open"]])
	 */
	find(
		filters: NodeFilters,
		pageSize?: number,
		pageToken?: number,
	): Promise<Either<AntboxError, { nodes: NodeMetadata[]; nextPageToken?: number }>>;

	/** Get a single node by UUID */
	get(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/** List children of a folder (omit parent for root) */
	list(parent?: string): Promise<Either<AntboxError, NodeMetadata[]>>;

	/** Breadcrumb path from root to a node */
	breadcrumbs(uuid: string): Promise<Either<AntboxError, NodeMetadata[]>>;

	/** Create a non-file node (folder, metanode, smart folder) */
	create(metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	/** Create a file node with binary content */
	createFile(
		file: File,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeMetadata>>;

	/** Update node metadata (partial update — only provided fields change) */
	update(
		uuid: string,
		metadata: Partial<NodeMetadata>,
	): Promise<Either<AntboxError, NodeMetadata>>;

	/** Replace file binary content */
	updateFile(uuid: string, file: File): Promise<Either<AntboxError, NodeMetadata>>;

	/** Copy node to a different parent folder */
	copy(uuid: string, parent: string): Promise<Either<AntboxError, NodeMetadata>>;

	/** Duplicate node in same folder (appends "(Copy)" to title) */
	duplicate(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/** Delete a node permanently (recursive for folders) */
	delete(uuid: string): Promise<Either<AntboxError, void>>;

	/** Lock node against modifications */
	lock(
		uuid: string,
		unlockAuthorizedGroups?: string[],
	): Promise<Either<AntboxError, NodeMetadata>>;

	/** Unlock a previously locked node */
	unlock(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/** Export node content as a File object */
	export(uuid: string): Promise<Either<AntboxError, File>>;

	/** Evaluate a smart folder — returns its dynamic children */
	evaluate(uuid: string): Promise<Either<AntboxError, unknown>>;
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
	| "contains"
	| "contains-all"
	| "contains-any"
	| "not-contains"
	| "contains-none";

type NodeFilter = [field: string, operator: FilterOperator, value: unknown];
type NodeFilters1D = NodeFilter[];
type NodeFilters2D = NodeFilters1D[];
type NodeFilters = NodeFilters1D | NodeFilters2D | string;

interface NodeMetadata {
	uuid: string;
	fid: string;
	title: string;
	description?: string;
	mimetype: string;
	size?: number; // bytes, file nodes only
	fulltext?: string; // extracted text, file nodes only
	parent: string;
	createdTime: string; // ISO 8601
	modifiedTime: string; // ISO 8601
	owner: string; // email
	tags?: string[];
	related?: string[];
	aspects?: string[];
	properties?: Record<string, unknown>; // keys: "aspectUuid:propertyName"
	permissions?: { read?: string[]; write?: string[]; delete?: string[] };
	locked?: boolean;
	lockedBy?: string;
	unlockAuthorizedGroups?: string[];
	workflowInstanceUuid?: string;
	workflowState?: string;
	// Folder-specific
	group?: string;
	filters?: NodeFilters;
	onCreate?: string[];
	onUpdate?: string[];
	onDelete?: string[];
}
```

## aspects SDK

```typescript
/**
 * AspectServiceProxy — read aspect schema definitions.
 * Read-only. Creating or modifying aspects requires admin REST API access.
 */
interface AspectServiceProxy {
	/**
	 * List all aspects defined in the system.
	 * Use this to discover the data model before querying by aspect properties.
	 *
	 * @example
	 * const all = await aspects.listAspects();
	 * const inv = all.find(a => a.title === "Invoice");
	 */
	listAspects(): Promise<AspectData[]>;

	/** Get a specific aspect by UUID */
	get(uuid: string): Promise<Either<AntboxError, AspectData>>;
}

interface AspectData {
	uuid: string;
	title: string;
	description?: string;
	properties: AspectProperty[];
	filters?: NodeFilters;
	createdTime: string;
	modifiedTime: string;
}

interface AspectProperty {
	name: string; // key used in node.properties as "aspectUuid:name"
	title: string; // human-readable label
	type: "string" | "number" | "boolean" | "uuid" | "object" | "array" | "file";
	arrayType?: "string" | "number" | "uuid";
	contentType?: string;
	readonly?: boolean;
	searchable?: boolean;
	required?: boolean;
	validationRegex?: string;
	validationList?: string[]; // allowed enum values
	validationFilters?: NodeFilters;
	defaultValue?: string | number | boolean;
}
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
| `application/vnd.antbox.aspect`      | Aspect definition                    |
| `application/vnd.antbox.feature`     | Feature/action definition            |

## runCode Template

```javascript
export default async function ({ nodes, aspects }) {
	// 1. Discover data model (when working with aspects)
	const allAspects = await aspects.listAspects();
	const target = allAspects.find((a) => a.title.includes("Invoice"));
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
