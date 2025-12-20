import type { FeatureDTO } from "application/feature_dto.ts";

export type GetSdkDocumentationFunction = (sdkName?: string) => string;

/**
 * FeatureDTO definition for the getSdkDocumentation tool
 */
export const GET_SDK_DOCUMENTATION_TOOL: Partial<FeatureDTO> = {
	uuid: "getSdkDocumentation",
	title: "getSdkDocumentation",
	description:
		"Get SDK documentation in TypeScript declaration format. Call without arguments to list all SDKs, or pass a SDK name ('nodes', 'aspects', 'custom') to get detailed documentation.",
	parameters: [
		{
			name: "sdkName",
			type: "string",
			required: false,
			description: "Optional SDK name to get detailed documentation for",
		},
	],
	returnType: "string",
};

/**
 * Factory function that creates a getSdkDocumentation tool with bound custom features.
 *
 * @param features - List of FeatureDTO objects that represent custom SDK methods
 * @returns A function that returns SDK documentation in TypeScript declaration format
 */
export function createGetSdkDocumentationTool(
	features: FeatureDTO[],
): GetSdkDocumentationFunction {
	return function getSdkDocumentation(sdkName?: string): string {
		if (!sdkName) {
			return generateSdkList(features);
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

function generateSdkList(features: FeatureDTO[]): string {
	const nodesMethods = [
		"copy",
		"create",
		"createFile",
		"delete",
		"duplicate",
		"export",
		"evaluate",
		"find",
		"get",
		"list",
		"breadcrumbs",
		"update",
		"updateFile",
		"lock",
		"unlock",
	];

	const aspectsMethods = ["listAspects"];

	const customMethods = features.map((f) => f.title);

	return `Available SDKs:

nodes (${nodesMethods.length} methods):
  ${nodesMethods.join(", ")}

aspects (${aspectsMethods.length} method):
  ${aspectsMethods.join(", ")}

custom (${customMethods.length} methods):
  ${customMethods.join(", ")}

Use getSdkDocumentation("sdkName") to get detailed documentation for a specific SDK.`;
}

function generateNodesDocumentation(): string {
	return `/**
 * NodeServiceProxy - Service for managing nodes in the system
 */
interface NodeServiceProxy {
	/**
	 * Copy a node to a new parent
	 * @param uuid - UUID of the node to copy
	 * @param parent - UUID of the destination parent node
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	copy(uuid: string, parent: string): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Create a new node
	 * @param metadata - Partial metadata for the new node
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	create(metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Create a new file node
	 * @param file - File to upload
	 * @param metadata - Partial metadata for the new file node
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	createFile(file: File, metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Delete a node
	 * @param uuid - UUID of the node to delete
	 * @returns Either<AntboxError, void>
	 */
	delete(uuid: string): Promise<Either<AntboxError, void>>;

	/**
	 * Duplicate a node (copy in same parent)
	 * @param uuid - UUID of the node to duplicate
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	duplicate(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Export a node
	 * @param uuid - UUID of the node to export
	 * @returns Either<AntboxError, File>
	 */
	export(uuid: string): Promise<Either<AntboxError, File>>;

	/**
	 * Evaluate a node
	 * @param uuid - UUID of the node to evaluate
	 * @returns Either<AntboxError, unknown>
	 */
	evaluate(uuid: string): Promise<Either<AntboxError, unknown>>;

	/**
	 * Find nodes matching filters
	 * @param filters - Array of filter conditions
	 * @param pageSize - Optional page size (default: all)
	 * @param pageToken - Optional page token for pagination
	 * @returns Either<AntboxError, { nodes: NodeMetadata[], nextPageToken?: number }>
	 */
	find(
		filters: NodeFilters,
		pageSize?: number,
		pageToken?: number
	): Promise<Either<AntboxError, { nodes: NodeMetadata[], nextPageToken?: number }>>;

	/**
	 * Get a node by UUID
	 * @param uuid - UUID of the node to retrieve
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	get(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * List child nodes of a parent
	 * @param parent - Optional UUID of parent node (default: root)
	 * @returns Either<AntboxError, NodeMetadata[]>
	 */
	list(parent?: string): Promise<Either<AntboxError, NodeMetadata[]>>;

	/**
	 * Get breadcrumb trail for a node
	 * @param uuid - UUID of the node
	 * @returns Either<AntboxError, NodeMetadata[]>
	 */
	breadcrumbs(uuid: string): Promise<Either<AntboxError, NodeMetadata[]>>;

	/**
	 * Update a node's metadata
	 * @param uuid - UUID of the node to update
	 * @param metadata - Partial metadata to update
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	update(uuid: string, metadata: Partial<NodeMetadata>): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Update a file node's content
	 * @param uuid - UUID of the file node to update
	 * @param file - New file content
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	updateFile(uuid: string, file: File): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Lock a node
	 * @param uuid - UUID of the node to lock
	 * @param unlockAuthorizedGroups - Optional groups authorized to unlock
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	lock(uuid: string, unlockAuthorizedGroups?: string[]): Promise<Either<AntboxError, NodeMetadata>>;

	/**
	 * Unlock a node
	 * @param uuid - UUID of the node to unlock
	 * @returns Either<AntboxError, NodeMetadata>
	 */
	unlock(uuid: string): Promise<Either<AntboxError, NodeMetadata>>;
}

// Supporting types
type FilterOperator =
	| "=="
	| "<="
	| ">="
	| "<"
	| ">"
	| "!="
	| "~="
	| "in"
	| "not-in"
	| "match"
	| "contains"
	| "contains-all"
	| "contains-any"
	| "not-contains"
	| "contains-none";

type NodeFilter = [field: string, operator: FilterOperator, value: unknown];
type NodeFilters1D = NodeFilter[];
type NodeFilters2D = NodeFilters1D[];
type NodeFilters = NodeFilters1D | NodeFilters2D;

interface NodeMetadata {
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
	properties?: Record<string, unknown>;
	fulltext?: string;
	filters?: NodeFilters;
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
	permissions?: {
		read?: string[];
		write?: string[];
		delete?: string[];
	};
	runManually?: boolean;
	runAs?: string;
	parameters?: FeatureParameter[];
	returnType?: "string" | "number" | "boolean" | "array" | "object" | "file" | "void";
	returnDescription?: string;
	returnContentType?: string;
	groupsAllowed?: string[];
	runOnCreates?: boolean;
	runOnUpdates?: boolean;
	runOnDeletes?: boolean;
	exposeAction?: boolean;
	exposeExtension?: boolean;
	exposeAITool?: boolean;
	model?: string;
	temperature?: number;
	maxTokens?: number;
	reasoning?: boolean;
	useTools?: boolean;
	systemInstructions?: string;
	structuredAnswer?: string;
	states?: WorkflowState[];
	availableStateNames?: string[];
	locked?: boolean;
	lockedBy?: string;
	unlockAuthorizedGroups?: string[];
	workflowInstanceUuid?: string;
	workflowState?: string;
}

interface FeatureParameter {
	name: string;
	type: "string" | "number" | "boolean" | "object" | "array" | "file";
	arrayType?: "string" | "number" | "file" | "object";
	contentType?: string;
	required: boolean;
	description?: string;
	defaultValue?: string | number | boolean | object | Array<unknown>;
}

interface WorkflowState {
	name: string;
	description?: string;
	transitions?: {
		to: string;
		condition?: string;
	}[];
}

interface AntboxError {
	name: string;
	message: string;
}

type Either<L, R> = { isLeft(): boolean; isRight(): boolean; value: L | R };
`;
}

function generateAspectsDocumentation(): string {
	return `/**
 * AspectServiceProxy - Service for managing aspects in the system
 */
interface AspectServiceProxy {
	/**
	 * List all aspects
	 * @returns Promise<AspectDTO[]>
	 */
	listAspects(): Promise<AspectDTO[]>;
}

// Supporting types
interface AspectDTO {
	uuid: string;
	title: string;
	description: string;
	exposeAction: boolean;
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runOnDeletes: boolean;
	runManually: boolean;
	filters: NodeFilters;
	exposeExtension: boolean;
	exposeAITool: boolean;
	runAs?: string;
	groupsAllowed: string[];
	parameters: FeatureParameter[];
	tags?: string[];
	returnType: "string" | "number" | "boolean" | "array" | "object" | "file" | "void";
	returnDescription?: string;
	returnContentType?: string;
}

type FilterOperator =
	| "=="
	| "<="
	| ">="
	| "<"
	| ">"
	| "!="
	| "~="
	| "in"
	| "not-in"
	| "match"
	| "contains"
	| "contains-all"
	| "contains-any"
	| "not-contains"
	| "contains-none";

type NodeFilter = [field: string, operator: FilterOperator, value: unknown];
type NodeFilters1D = NodeFilter[];
type NodeFilters2D = NodeFilters1D[];
type NodeFilters = NodeFilters1D | NodeFilters2D;

interface FeatureParameter {
	name: string;
	type: "string" | "number" | "boolean" | "object" | "array" | "file";
	arrayType?: "string" | "number" | "file" | "object";
	contentType?: string;
	required: boolean;
	description?: string;
	defaultValue?: string | number | boolean | object | Array<unknown>;
}
`;
}

function generateCustomDocumentation(features: FeatureDTO[]): string {
	if (features.length === 0) {
		return `/**
 * Custom SDK - No custom features available
 */
interface Custom {
	// No custom methods available
}
`;
	}

	const methods = features.map((feature) => {
		const params = feature.parameters.map((param) => {
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

		const paramSignature = feature.parameters.map((param) => {
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
 * Custom SDK - User-defined features
 */
interface Custom {
${methods}
}
`;
}
