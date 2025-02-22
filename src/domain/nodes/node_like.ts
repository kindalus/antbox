import { ActionNode } from "domain/actions/action_node.ts";
import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import { AspectNode } from "domain/aspects/aspect_node.ts";
import { GroupNode } from "domain/auth/group_node.ts";
import { UserNode } from "domain/auth/user_node.ts";
import { ExtNode } from "domain/exts/ext_node.ts";
import { FileNode } from "./file_node.ts";
import { FolderNode } from "./folder_node.ts";
import { MetaNode } from "./meta_node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";

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
