import type { FileNode } from "./nodes/file_node.ts";
import type { FolderNode } from "./nodes/folder_node.ts";
import type { MetaNode } from "domain/nodes/meta_node.ts";
import type { SmartFolderNode } from "domain/nodes/smart_folder_node.ts";

export type NodeLike =
	| FileNode
	| FolderNode
	| MetaNode
	| SmartFolderNode;

export type AspectableNode = FileNode | FolderNode | MetaNode;

export type FileLikeNode = FileNode;
