import { ActionNode } from "../actions/action_node.ts";
import { ApiKeyNode } from "../api_keys/api_key_node.ts";
import { ArticleNode } from "../articles/article_node.ts";
import { AspectNode } from "../aspects/aspect_node.ts";
import { GroupNode } from "../auth/group_node.ts";
import { UserNode } from "../auth/user_node.ts";
import { ExtNode } from "../exts/ext_node.ts";
import { FormSpecificationNode } from "../forms_specifications/form_specification.ts";
import { FileNode } from "./file_node.ts";
import { FolderNode } from "./folder_node.ts";
import { MetaNode } from "./meta_node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";

export type NodeLike =
	| ActionNode
	| ArticleNode
	| ApiKeyNode
	| AspectNode
	| ExtNode
	| FileNode
	| FolderNode
	| FormSpecificationNode
	| GroupNode
	| MetaNode
	| SmartFolderNode
	| UserNode;
