import { ActionNode } from "domain/actions/action_node.ts";
import { AspectNode } from "domain/aspects/aspect_node.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { UserNode } from "domain/users_groups/user_node.ts";
import { ExtNode } from "domain/exts/ext_node.ts";
import { FileNode } from "./file_node.ts";
import { FolderNode } from "./folder_node.ts";
import { MetaNode } from "./meta_node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";
import type { NodeLike } from "domain/node_like.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { FunctionNode as SkillNode } from "domain/skills/skill_node.ts";

export class Nodes {
  static FID_PREFIX = "--fid--";

  static FOLDER_MIMETYPE = "application/vnd.antbox.folder";
  static META_NODE_MIMETYPE = "application/vnd.antbox.metanode";
  static SMART_FOLDER_MIMETYPE = "application/vnd.antbox.smartfolder";
  static ASPECT_MIMETYPE = "application/vnd.antbox.aspect";
  static ACTION_MIMETYPE = "application/vnd.antbox.action";
  static SKILL_MIMETYPE = "application/vnd.antbox.skill";
  static EXT_MIMETYPE = "application/vnd.antbox.extension";
  static USER_MIMETYPE = "application/vnd.antbox.user";
  static GROUP_MIMETYPE = "application/vnd.antbox.group";
  static API_KEY_MIMETYPE = "application/vnd.antbox.apikey";
  static ARTICLE_MIMETYPE = "application/vnd.antbox.article";

  static SYSTEM_MIMETYPES = [
    Nodes.ASPECT_MIMETYPE,
    Nodes.ACTION_MIMETYPE,
    Nodes.SKILL_MIMETYPE,
    Nodes.EXT_MIMETYPE,
    Nodes.USER_MIMETYPE,
    Nodes.GROUP_MIMETYPE,
    Nodes.API_KEY_MIMETYPE,
  ];

  static fidToUuid(fid: string): string {
    return `${Nodes.FID_PREFIX}${fid}`;
  }

  static isFid(uuid: string): boolean {
    return uuid?.startsWith(Nodes.FID_PREFIX);
  }

  static uuidToFid(fid: string): string {
    return fid?.startsWith(Nodes.FID_PREFIX)
      ? fid.substring(Nodes.FID_PREFIX.length)
      : fid;
  }

  static isFolder(node: NodeLike): node is FolderNode {
    return node.mimetype === Nodes.FOLDER_MIMETYPE;
  }

  static isUser(node: NodeLike): node is UserNode {
    return node.mimetype === Nodes.USER_MIMETYPE;
  }

  static isApikey(node: NodeLike): node is ApiKeyNode {
    return node.mimetype === Nodes.API_KEY_MIMETYPE;
  }

  static isSmartFolder(node: NodeLike): node is SmartFolderNode {
    return node.mimetype === Nodes.SMART_FOLDER_MIMETYPE;
  }

  static isAspect(node: NodeLike): node is AspectNode {
    return node.mimetype === Nodes.ASPECT_MIMETYPE;
  }

  static isMetaNode(node: NodeLike): node is MetaNode {
    return node.mimetype === Nodes.META_NODE_MIMETYPE;
  }

  static isAction(node: NodeLike): node is ActionNode {
    return node.mimetype === Nodes.ACTION_MIMETYPE;
  }

  static isSkill(node: NodeLike): node is SkillNode {
    return node.mimetype === Nodes.SKILL_MIMETYPE;
  }

  static isExt(node: NodeLike): node is ExtNode {
    return node.mimetype === Nodes.EXT_MIMETYPE;
  }

  static isGroup(node: NodeLike): node is GroupNode {
    return node.mimetype === Nodes.GROUP_MIMETYPE;
  }

  static isArticle(node: NodeLike): node is ArticleNode {
    return node.mimetype === Nodes.ARTICLE_MIMETYPE;
  }

  static isJavascript(file: File) {
    return file.type.startsWith("application/javascript") ||
      file.type.startsWith("text/javascript");
  }

  static isFile(node: NodeLike): node is FileNode {
    return !node.mimetype.startsWith("application/vnd.antbox");
  }

  static hasAspects(node: NodeLike): node is FileNode | FolderNode | MetaNode {
    return Nodes.isMetaNode(node) || Nodes.isFile(node) || Nodes.isFolder(node);
  }

  static isFileLike(
    node: NodeLike,
  ): node is FileNode | ExtNode | ActionNode | ArticleNode {
    return Nodes.isFile(node) || Nodes.isExt(node) || Nodes.isAction(node) ||
      Nodes.isArticle(node);
  }

  static isTextPlain(node: NodeLike) {
    return node.mimetype === "text/plain";
  }

  static isHtml(node: NodeLike) {
    return node.mimetype === "text/html";
  }

  static isMarkdown(node: NodeLike) {
    return node.mimetype === "text/markdown";
  }
}
