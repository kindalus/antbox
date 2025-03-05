import { ActionNode } from "domain/actions/action_node.ts";
import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import { AspectNode } from "domain/aspects/aspect_node.ts";
import { GroupNode } from "domain/auth/group_node.ts";
import { UserNode } from "domain/auth/user_node.ts";
import { ExtNode } from "domain/exts/ext_node.ts";
import type { FileNode } from "./nodes/file_node";
import type { FolderNode } from "./nodes/folder_node";
import type { MetaNode } from "./nodes/meta_node";
import type { SmartFolderNode } from "./nodes/smart_folder_node";

export type NodeLike =
  | ActionNode
  | ApiKeyNode
  | ArticleNode
  | AspectNode
  | ExtNode
  | FileNode
  | FolderNode
  | GroupNode
  | MetaNode
  | SmartFolderNode
  | UserNode;

export type AspectableNode = ArticleNode | FileNode | FolderNode | MetaNode;

export type FileLikeNode = ActionNode | ArticleNode | FileNode | ExtNode;
