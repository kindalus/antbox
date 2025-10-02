import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { AspectNode } from "domain/aspects/aspect_node.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { UserNode } from "domain/users_groups/user_node.ts";
import type { FileNode } from "./nodes/file_node.ts";
import type { FolderNode } from "./nodes/folder_node.ts";
import type { MetaNode } from "domain/nodes/meta_node.ts";
import type { SmartFolderNode } from "domain/nodes/smart_folder_node.ts";

import { FeatureNode } from "domain/features/feature_node.ts";

export type NodeLike =
	| ApiKeyNode
	| AspectNode
	| FileNode
	| FolderNode
	| GroupNode
	| MetaNode
	| FeatureNode
	| SmartFolderNode
	| UserNode;

export type AspectableNode = FileNode | FolderNode | MetaNode;

export type FileLikeNode = FileNode | FeatureNode;
