import { FeatureDTO } from "application/feature_dto.ts";

/**
 * Built-in tools (always available when useTools: true)
 * These tools provide agents with access to core Antbox operations, templates, and documentation
 */
export const BUILTIN_AGENT_TOOLS: Partial<FeatureDTO>[] = [
	{
		uuid: "NodeService:find",
		name: "find",
		description:
			`Search and retrieve nodes from the Antbox repository using flexible filtering criteria.

This tool supports complex queries using NodeFilter tuples where each filter is [field, operator, value].

**Available operators:**
- "==" (equals): Exact match
- "!=" (not equals): Does not match
- ">" (greater than): For numeric/date comparisons
- ">=" (greater than or equal): For numeric/date comparisons
- "<" (less than): For numeric/date comparisons
- "<=" (less than or equal): For numeric/date comparisons
- "~=" semantic search over content
- "in": Value exists in an array
- "not-in": Value does not exist in an array
- "contains": Array contains specific value
- "match": Text pattern matching

**Common searchable fields:**
- uuid: Unique identifier
- title: Node title/name
- description: Node description
- mimetype: MIME type (e.g., "folder", "text/plain", "application/pdf")
- parent: Parent folder UUID
- owner: Owner email
- tags: Associated tags array
- aspects: Associated aspects array
- createdTime: Creation timestamp
- modifiedTime: Last modification timestamp
- size: File size in bytes
- fulltext: Full-text search content
- group: Associated group
- groups: Groups with access

**Examples:**
- Find all PDFs: [["mimetype", "==", "application/pdf"]]
- Find files in folder: [["parent", "==", "folder-uuid"]]
- Find by owner: [["owner", "==", "user@example.com"]]
- Find recent files: [["createdTime", ">", "2024-01-01"]]
- Complex query with AND: [["mimetype", "==", "text/plain"], ["size", "<", 1000]]
- OR queries: [[["title", "~=", "report"], ["description", "~=", "report"]]]

The filters parameter can be:
- Single filter: [field, operator, value]
- Array of filters (AND logic): [[field1, op1, val1], [field2, op2, val2]]
- Array of filter arrays (OR logic): [[[field1, op1, val1]], [[field2, op2, val2]]]`,
		parameters: [
			{
				name: "filters",
				type: "array",
				required: true,
				description:
					"Array of NodeFilter tuples [field, operator, value] for querying nodes. Can be single filter, array of filters (AND), or nested arrays (OR). Empty array returns all accessible nodes.",
				arrayType: "object",
			},
		],
		returnType: "array",
		returnDescription:
			"Array of matching NodeLike objects containing full node metadata including uuid, title, description, mimetype, parent, owner, tags, aspects, properties, permissions, and content data",
	},
	{
		uuid: "NodeService:get",
		name: "get",
		description: `Retrieve a specific node by its UUID with full metadata and content.

This tool fetches a complete node object including all metadata, properties, aspects, and content.
The returned node contains comprehensive information about the item including:

**Core metadata:**
- uuid: Unique identifier
- fid: File identifier
- title: Display name
- name: File/folder name
- description: Detailed description
- mimetype: Content type
- size: File size in bytes
- parent: Parent folder UUID
- createdTime: When created (ISO timestamp)
- modifiedTime: When last modified (ISO timestamp)
- owner: Owner email address

**Additional properties:**
- aspects: Associated aspect UUIDs
- tags: Descriptive tags
- related: Related node UUIDs
- properties: Custom properties object
- fulltext: Searchable text content
- permissions: Access control settings
- groups: Authorized groups

**Usage examples:**
- Get user details: get("user-uuid")
- Retrieve document: get("document-uuid")
- Fetch folder info: get("folder-uuid")
- Access aspect definition: get("aspect-uuid")

Returns detailed node information or error if not found/unauthorized.`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"Unique identifier (UUID) of the node to retrieve. Must be a valid UUID string format.",
			},
		],
		returnType: "object",
		returnDescription:
			"Complete NodeLike object with all metadata, properties, aspects, content, and permissions. Includes uuid, title, description, mimetype, size, parent, owner, createdTime, modifiedTime, tags, aspects, properties, permissions, and any node-specific data",
	},
	{
		uuid: "OcrModel:ocr",
		name: "ocr",
		description:
			`Extract text content from images and documents using Optical Character Recognition (OCR).

This tool processes various image and document formats to extract readable text content.
It's particularly useful for digitizing scanned documents, extracting text from screenshots,
reading text from photos, and processing various document formats.

**Supported formats:**
- Image formats: JPEG, PNG, GIF, BMP, TIFF, WebP
- Document formats: PDF (scanned pages)
- Common screenshot formats
- Photos containing text
- Scanned documents and receipts
- Handwritten text (with varying accuracy)

**Use cases:**
- Extract text from uploaded images
- Process scanned documents
- Read text from screenshots
- Digitize handwritten notes
- Extract data from forms and receipts
- Process document images for indexing
- Convert image-based content to searchable text

**Quality factors:**
- Higher resolution images generally produce better results
- Clear, well-lit text is more accurately recognized
- Standard fonts work better than stylized text
- Horizontal text orientation is optimal
- Good contrast between text and background improves accuracy

**Output:**
Returns plain text string containing all recognized text from the image.
Text layout and formatting may not be preserved exactly as in the original.`,
		parameters: [
			{
				name: "file",
				type: "file",
				required: true,
				description:
					"Image or document file to process with OCR. Accepts common image formats (JPEG, PNG, GIF, BMP, TIFF, WebP) and PDF files. File should contain visible text for extraction.",
			},
		],
		returnType: "string",
		returnDescription:
			"Plain text string containing all text content extracted from the image or document. Text is returned as recognized, potentially with line breaks preserved where detected in the original layout.",
	},
	{
		uuid: "NodeService:create",
		name: "create",
		description: `Create a new node in the Antbox repository with specified metadata.

This tool creates various types of nodes including files, folders, aspects, users, groups, and other entities.
The system automatically generates missing required fields and validates the node against parent folder constraints.

**Node Types (by mimetype):**
- "folder": Directory/folder nodes
- "text/plain": Plain text files
- "text/html": HTML documents
- "text/markdown": Markdown files
- "application/pdf": PDF documents
- "application/json": JSON data files
- Custom mimetypes for specialized nodes

**Auto-generated fields:**
- uuid: Generated if not provided
- fid: File identifier generated from title
- owner: Defaults to authenticated user
- group: Defaults to user's primary group
- createdTime: Current timestamp
- modifiedTime: Current timestamp

**Required permissions:**
- Write access to parent folder
- Node must satisfy parent folder filters

**Validation:**
- Validates against associated aspects
- Checks parent folder permissions and filters
- Validates feature definitions for executable nodes
- Generates fulltext search content

**Usage examples:**
- Create folder: {"title": "My Folder", "mimetype": "folder", "parent": "parent-uuid"}
- Create document: {"title": "Report", "mimetype": "text/markdown", "parent": "folder-uuid"}
- Create with aspects: {"title": "Article", "aspects": ["article-aspect-uuid"]}`,
		parameters: [
			{
				name: "metadata",
				type: "object",
				required: true,
				description:
					"Partial NodeMetadata object containing node properties. Required fields: title, mimetype, parent. Optional: uuid, description, aspects, tags, properties, permissions, owner, group, and other node-specific fields.",
			},
		],
		returnType: "object",
		returnDescription:
			"Complete NodeLike object of the created node with all metadata, generated fields (uuid, fid, timestamps), and validation results. Includes all properties from the input plus system-generated values.",
	},
	{
		uuid: "NodeService:duplicate",
		name: "duplicate",
		description: `Create a duplicate copy of an existing node in the same parent folder.

This tool creates an exact copy of a node with a new UUID and modified title (appends " 2").
For file nodes, it also duplicates the file content. Folders cannot be duplicated.

**Behavior:**
- Generates new UUID for the duplicate
- Appends " 2" to the original title
- Generates new fid (file identifier)
- Copies all metadata including aspects, tags, and properties
- For files: Copies the actual file content
- Maintains same parent folder
- Preserves permissions and other settings

**Restrictions:**
- Cannot duplicate folder nodes
- Requires read access to source node
- Requires write access to parent folder

**Use cases:**
- Create backup copies of important documents
- Template duplication for similar content
- Version management workflows
- Quick copy for editing without affecting original

**Example:**
Original: "Project Report.pdf" → Duplicate: "Project Report 2.pdf"`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"UUID of the existing node to duplicate. Must be a valid node UUID that the user has read access to. Cannot be a folder node.",
			},
		],
		returnType: "object",
		returnDescription:
			"Complete NodeLike object of the duplicated node with new UUID, modified title, and all copied metadata and content. For file nodes, includes copied file data.",
	},
	{
		uuid: "NodeService:copy",
		name: "copy",
		description: `Copy an existing node to a different parent folder.

This tool creates a copy of a node and places it in a specified target folder.
Similar to duplicate but allows placing the copy in a different location.

**Behavior:**
- Generates new UUID for the copy
- Appends " 2" to the original title
- Generates new fid (file identifier)
- Copies all metadata including aspects, tags, and properties
- For files: Copies the actual file content
- Places copy in specified parent folder
- Preserves permissions and other settings

**Restrictions:**
- Cannot copy folder nodes
- Requires read access to source node
- Requires write access to target parent folder
- Target parent must exist and be accessible

**Use cases:**
- Move content between projects/folders while keeping original
- Organize content across different folder structures
- Share copies of documents to different teams/groups
- Archive content to different locations

**Example:**
Copy "Report.pdf" from "Projects" to "Archive" folder`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"UUID of the existing node to copy. Must be a valid node UUID that the user has read access to. Cannot be a folder node.",
			},
			{
				name: "parent",
				type: "string",
				required: true,
				description:
					"UUID of the target parent folder where the copy will be placed. User must have write access to this folder.",
			},
		],
		returnType: "object",
		returnDescription:
			"Complete NodeLike object of the copied node with new UUID, modified title, specified parent, and all copied metadata and content.",
	},
	{
		uuid: "NodeService:breadcrumbs",
		name: "breadcrumbs",
		description: `Get the hierarchical path (breadcrumbs) from root to a specific folder.

This tool returns the complete folder hierarchy path showing how to navigate from the root folder
to the specified folder, providing context for the folder's location in the system.

**Behavior:**
- Traverses up the folder hierarchy from the target folder
- Builds path from root folder to target folder
- Returns array of folder information in hierarchical order
- Always starts with root folder
- Shows complete navigation path

**Restrictions:**
- Only works with folder nodes
- Requires read access to the folder and all parent folders
- Returns error if any folder in the path is inaccessible

**Use cases:**
- Display navigation breadcrumbs in user interfaces
- Show folder location context
- Generate folder paths for documentation
- Understand organizational structure
- Navigation assistance for users

**Return format:**
Array of objects with uuid and title for each folder in the path from root to target.

**Example breadcrumbs:**
[
  {"uuid": "root-uuid", "title": "Root"},
  {"uuid": "projects-uuid", "title": "Projects"},
  {"uuid": "2024-uuid", "title": "2024"},
  {"uuid": "reports-uuid", "title": "Reports"}
]`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"UUID of the folder node to get breadcrumbs for. Must be a valid folder node UUID that the user has read access to.",
			},
		],
		returnType: "array",
		returnDescription:
			"Array of breadcrumb objects, each containing {uuid: string, title: string} representing the folder hierarchy from root to the specified folder in navigation order.",
	},
	{
		uuid: "NodeService:delete",
		name: "delete",
		description: `Delete a node and all its contents from the Antbox repository.

This tool permanently removes nodes from the system. For folders, it recursively deletes
all contained files and subfolders. For files, it removes both metadata and file content.

**Behavior:**
- Permanently removes node from repository
- For files: Deletes both metadata and file content from storage
- For folders: Recursively deletes all children first, then the folder
- Publishes NodeDeletedEvent for each deleted node
- Cannot be undone - deletion is permanent

**Restrictions:**
- Requires write access to the parent folder
- Cannot delete system folders or protected nodes
- Folder deletion requires all children to be deletable
- Some nodes may have delete restrictions based on their type

**Safety considerations:**
- Deletion is permanent and cannot be undone
- Folder deletion can remove large amounts of data
- Always verify node UUID before deletion
- Consider backing up important data before deletion

**Use cases:**
- Clean up temporary files
- Remove outdated documents
- Delete empty or unused folders
- Maintain repository organization
- Remove sensitive data that should not be retained

**Events:**
Publishes NodeDeletedEvent for integration with other systems and audit trails.`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"UUID of the node to delete permanently. User must have write access to the parent folder. Deletion cannot be undone.",
			},
		],
		returnType: "void",
		returnDescription:
			"No return value on successful deletion. The node and all its contents are permanently removed from the repository.",
	},
	{
		uuid: "NodeService:update",
		name: "update",
		description: `Update an existing node's metadata and properties.

This tool modifies node properties while maintaining data integrity and validation.
It supports updating most node fields while protecting readonly and system fields.

**Updatable fields:**
- title: Display name
- description: Detailed description
- tags: Descriptive tags array
- aspects: Associated aspects array
- properties: Custom properties object
- permissions: Access control settings
- parent: Move to different folder
- Most metadata fields

**Protected/readonly fields:**
- uuid: Cannot be changed
- owner: Protected in most cases
- createdTime: Immutable timestamp
- fid: Auto-managed file identifier
- System-specific fields

**Validation:**
- Validates against associated aspects
- Checks parent folder permissions and constraints
- Validates feature definitions for executable nodes
- Ensures node satisfies parent folder filters
- For folders: Validates that new filters don't invalidate existing children

**Special handling:**
- File size updates supported for file nodes
- API keys cannot be updated
- Folder filter changes validate all existing children
- Aspect changes trigger property validation
- Moving nodes validates target parent permissions

**Events:**
Publishes NodeUpdatedEvent with change details for integration and audit purposes.

**Examples:**
- Update title: {"title": "New Title"}
- Add tags: {"tags": ["important", "draft"]}
- Move node: {"parent": "new-parent-uuid"}
- Update properties: {"properties": {"priority": "high"}}`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"UUID of the existing node to update. User must have write access to the parent folder.",
			},
			{
				name: "metadata",
				type: "object",
				required: true,
				description:
					"Partial NodeMetadata object containing fields to update. Only provided fields will be updated. Readonly fields are filtered out automatically. Common fields: title, description, tags, aspects, properties, permissions, parent.",
			},
		],
		returnType: "void",
		returnDescription:
			"No return value on successful update. The node is updated in the repository with the new metadata and triggers validation and events.",
	},
	{
		uuid: "Templates:list",
		name: "listTemplates",
		description: `List all available code and configuration templates.

This tool returns a list of all available templates that can be used to bootstrap new features,
actions, and configurations in Antbox. Templates provide starting points for common development tasks.

**Available template types:**
- Feature templates: TypeScript templates for creating custom features
- Action templates: JavaScript templates for node processing actions
- Configuration templates: JSON configuration examples

**Use cases:**
- Discover available templates for development
- Find the right template for a specific task
- Get template UUIDs to fetch specific template content
- Understand what templates are available in the system

**Template information includes:**
- uuid: Unique identifier for fetching the template
- description: What the template is for and how to use it

Use the Templates:get tool with the template UUID to retrieve the actual template content.`,
		parameters: [],
		returnType: "array",
		returnDescription:
			"Array of template objects, each containing {uuid: string, description: string} describing available templates in the system.",
	},
	{
		uuid: "Templates:get",
		name: "getTemplate",
		description: `Retrieve a specific code or configuration template by its UUID.

This tool fetches the complete content of a template file that can be used as a starting point
for creating new features, actions, or configurations in Antbox.

**Supported template formats:**
- TypeScript (.ts): Feature and component templates
- JavaScript (.js): Action and script templates
- JSON (.json): Configuration templates

**Common templates:**
- example-feature: Template for creating custom Antbox features
- example-action: JavaScript template for processing nodes
- example-config: JSON configuration example

**Use cases:**
- Get template code to create new features
- Copy template content as a starting point
- Study example implementations
- Bootstrap new development tasks

**Response includes:**
- Full template source code
- Proper MIME type for the template format

Use Templates:list to discover available template UUIDs.`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"UUID of the template to retrieve (e.g., 'example-feature', 'example-action', 'example-config'). Use Templates:list to discover available UUIDs.",
			},
		],
		returnType: "string",
		returnDescription:
			"Complete template file content as a string, ready to be used as a starting point for development.",
	},
	{
		uuid: "Docs:list",
		name: "listDocs",
		description: `List all available Antbox documentation.

This tool returns a comprehensive list of all available documentation resources in the Antbox system.
Documentation covers architecture, features, guides, and best practices.

**Available documentation topics:**
- AI Agents: Guide to creating and using AI agents
- Architecture: System architecture and design overview
- Features: Detailed feature documentation
- Getting Started: Beginner's guide to Antbox
- Nodes and Aspects: Core concepts explanation
- Storage Providers: Storage configuration and options

**Use cases:**
- Discover available documentation
- Find documentation for specific topics
- Get documentation UUIDs to fetch full content
- Understand what areas are documented

**Documentation information includes:**
- uuid: Unique identifier for fetching the documentation
- description: Brief summary of what the documentation covers

Use the Docs:get tool with the documentation UUID to retrieve the full documentation content.`,
		parameters: [],
		returnType: "array",
		returnDescription:
			"Array of documentation objects, each containing {uuid: string, description: string} describing available documentation in the system.",
	},
	{
		uuid: "Docs:get",
		name: "getDoc",
		description: `Retrieve specific Antbox documentation by its UUID.

This tool fetches the complete content of a documentation file in Markdown format.
Documentation provides detailed information about Antbox features, architecture, and usage.

**Available documentation:**
- ai-agents: Guide to AI agents in Antbox
- architecture: System architecture overview
- features: Available features documentation
- getting-started: Getting started guide
- nodes-and-aspects: Nodes and aspects explained
- storage-providers: Storage providers documentation

**Use cases:**
- Read detailed documentation on specific topics
- Learn about Antbox features and capabilities
- Understand system architecture
- Get implementation guidance
- Access reference materials

**Response format:**
- Full documentation content in Markdown format
- Ready to be parsed, displayed, or processed

Use Docs:list to discover available documentation UUIDs.`,
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description:
					"UUID of the documentation to retrieve (e.g., 'ai-agents', 'architecture', 'getting-started'). Use Docs:list to discover available UUIDs.",
			},
		],
		returnType: "string",
		returnDescription:
			"Complete documentation content in Markdown format, containing detailed information about the requested topic.",
	},
];
