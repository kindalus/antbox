import { type Either } from "shared/either";
import { ValidationError } from "shared/validation_error";
import { ActionNode } from "./actions/action_node";
import { ApiKeyNode } from "./api_keys/api_key_node";
import { ArticleNode } from "./articles/article_node.ts";
import { AspectNode } from "./aspects/aspect_node";
import { GroupNode } from "./auth/group_node";
import { ExtNode } from "./exts/ext_node.ts";
import { FileNode } from "./nodes/file_node";
import { FolderNode } from "./nodes/folder_node";
import { MetaNode } from "./nodes/meta_node";
import { type NodeLike } from "./nodes/node_like";
import { type NodeMetadata } from "./nodes/node_metadata";
import { Nodes } from "./nodes/nodes";
import { SmartFolderNode } from "./nodes/smart_folder_node";

export class NodeFactory {
  static from<T extends NodeLike>(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, T> {
    let createFn: (
      metadata: Partial<NodeMetadata>,
    ) => Either<ValidationError, NodeLike>;

    switch (metadata.mimetype) {
      case Nodes.ACTION_MIMETYPE:
        createFn = ActionNode.create;
        break;

      case Nodes.API_KEY_MIMETYPE:
        createFn = ApiKeyNode.create;
        break;

      case Nodes.ASPECT_MIMETYPE:
        createFn = AspectNode.create;
        break;

      case Nodes.EXT_MIMETYPE:
        createFn = ExtNode.create;
        break;

      case Nodes.FOLDER_MIMETYPE:
        createFn = FolderNode.create;
        break;

      case Nodes.GROUP_MIMETYPE:
        createFn = GroupNode.create;
        break;

      case Nodes.META_NODE_MIMETYPE:
        createFn = MetaNode.create;
        break;

      case Nodes.SMART_FOLDER_MIMETYPE:
        createFn = SmartFolderNode.create;
        break;

      case Nodes.ARTICLE_MIMETYPE:
        createFn = ArticleNode.create;
        break;

      default:
        createFn = FileNode.create;
    }

    return createFn(metadata) as Either<ValidationError, T>;
  }
}
