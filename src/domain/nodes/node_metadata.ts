import { type Permissions } from "domain/nodes/node.ts";
import { type NodeFilters } from "domain/nodes/node_filter.ts";
import { type NodeProperties } from "domain/nodes/node_properties.ts";
import { type ArticlePropertiesMap } from "../articles/article_properties.ts";

/**
 * NodeMetadata - Represents the metadata for a node in the system.
 *
 * This interface contains both common fields (present in the base Node class)
 * and extended fields for specific node types.
 *
 * Node Types:
 * - FileNode: Regular files with content (uses WithAspectMixin, FileMixin)
 * - FolderNode: Containers for other nodes (uses WithAspectMixin, FolderMixin)
 * - SmartFolderNode: Virtual folders with dynamic content based on filters
 * - MetaNode: Metadata-only nodes without file content (uses WithAspectMixin)
 * - ArticleNode: Localized content articles (uses WithAspectMixin)
 */
export interface NodeMetadata {
	// ============================================================================
	// COMMON FIELDS (from Node base class)
	// Present in all node types: FileNode, FolderNode, SmartFolderNode, MetaNode, ArticleNode
	// ============================================================================

	/** Unique identifier for the node */
	uuid: string;
	/** Friendly identifier, auto-generated from title if not provided */
	fid: string;
	/** Display name of the node */
	title: string;
	/** Optional description of the node */
	description?: string;
	/** MIME type of the node content */
	mimetype: string;
	/** UUID of the parent folder */
	parent: string;
	/** ISO timestamp when the node was created */
	createdTime: string;
	/** ISO timestamp when the node was last modified */
	modifiedTime: string;
	/** Email of the user who owns this node */
	owner: string;
	/** Extracted text content for search indexing */
	fulltext?: string;
	/** User-defined tags for categorization */
	tags?: string[];
	/** Whether the node is currently locked */
	locked?: boolean;
	/** Email of the user who locked the node */
	lockedBy?: string;
	/** Groups authorized to unlock this node */
	unlockAuthorizedGroups?: string[];
	/** UUID of the workflow instance attached to this node */
	workflowInstanceUuid?: string;
	/** Current state name in the workflow */
	workflowState?: string;

	// ============================================================================
	// WithAspectMixin FIELDS
	// Present in: FileNode, FolderNode, MetaNode, ArticleNode
	// ============================================================================

	/** UUIDs of aspects applied to this node */
	aspects?: string[];
	/** Custom properties defined by aspects */
	properties?: NodeProperties;
	/** UUIDs of related nodes */
	related?: string[];

	// ============================================================================
	// FileMixin FIELDS
	// Present in: FileNode
	// ============================================================================

	/** File size in bytes */
	size?: number;
	/** CDN URL for the file, provided by storage providers that support CDN */
	cdnUrl?: string;

	// ============================================================================
	// FolderMixin FIELDS
	// Present in: FolderNode
	// ============================================================================

	/** Group UUID associated with this folder */
	group?: string;
	/** Access control permissions */
	permissions?: Permissions;
	/** Feature UUIDs to run when a node is created in this folder */
	onCreate?: string[];
	/** Feature UUIDs to run when a node is updated in this folder */
	onUpdate?: string[];
	/** Feature UUIDs to run when a node is deleted in this folder */
	onDelete?: string[];

	// ============================================================================
	// SmartFolderNode / FolderNode FIELDS
	// Present in: SmartFolderNode (required), FolderNode (optional)
	// ============================================================================

	/** Filter conditions for dynamic content */
	filters?: NodeFilters;

	// ============================================================================
	// ArticleNode FIELDS
	// Present in: ArticleNode
	// ============================================================================

	/** Localized article properties map (keyed by locale) */
	articleProperties?: ArticlePropertiesMap;
	/** Author of the article */
	articleAuthor?: string;
}
