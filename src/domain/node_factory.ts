import { type Either } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";

import { ApiKeyNode } from "./api_keys/api_key_node.ts";
import { ArticleNode } from "./articles/article_node.ts";
import { AspectNode } from "./aspects/aspect_node.ts";
import { GroupNode } from "./users_groups/group_node.ts";

import { FileNode } from "./nodes/file_node.ts";
import { FolderNode } from "./nodes/folder_node.ts";
import { MetaNode } from "./nodes/meta_node.ts";
import { type NodeMetadata } from "./nodes/node_metadata.ts";
import { Nodes } from "./nodes/nodes.ts";
import { SmartFolderNode } from "./nodes/smart_folder_node.ts";
import { NodeLike } from "domain/node_like.ts";
import { SkillNode } from "domain/skills/skill_node.ts";

export class NodeFactory {
  static from<T extends NodeLike>(
    metadata: Partial<NodeMetadata>,
  ): Either<ValidationError, T> {
    let createFn: (
      metadata: any,
    ) => Either<ValidationError, NodeLike>;

    switch (metadata.mimetype) {
      case Nodes.ACTION_MIMETYPE:
        createFn = SkillNode.create;
        break;

      case Nodes.API_KEY_MIMETYPE:
        createFn = ApiKeyNode.create;
        break;

      case Nodes.ASPECT_MIMETYPE:
        createFn = AspectNode.create;
        break;

      case Nodes.EXT_MIMETYPE:
        createFn = SkillNode.create;
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

      case Nodes.SKILL_MIMETYPE:
        createFn = SkillNode.create;
        break;

      default:
        createFn = FileNode.create;
    }

    return createFn(metadata) as Either<ValidationError, T>;
  }
}
