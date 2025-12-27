import { FileNode } from "./file_node.ts";
import { FolderNode } from "./folder_node.ts";
import { MetaNode } from "./meta_node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeMetadata } from "./node_metadata.ts";

export class Nodes {
	static FID_PREFIX = "--fid--";

	static ROOT_FOLDER_UUID = "--root--";

	static FOLDER_MIMETYPE = "application/vnd.antbox.folder";
	static META_NODE_MIMETYPE = "application/vnd.antbox.metanode";
	static SMART_FOLDER_MIMETYPE = "application/vnd.antbox.smartfolder";
	static ARTICLE_MIMETYPE = "application/vnd.antbox.article";

	static fidToUuid(fid: string): string {
		return `${Nodes.FID_PREFIX}${fid}`;
	}

	static isFid(uuid: string): boolean {
		return uuid?.startsWith(Nodes.FID_PREFIX);
	}

	static uuidToFid(fid: string): string {
		return fid?.startsWith(Nodes.FID_PREFIX) ? fid.substring(Nodes.FID_PREFIX.length) : fid;
	}

	static isFolder(node: NodeLike | NodeMetadata): node is FolderNode {
		return node.mimetype === Nodes.FOLDER_MIMETYPE;
	}

	static isSmartFolder(node: NodeLike | NodeMetadata): node is SmartFolderNode {
		return node.mimetype === Nodes.SMART_FOLDER_MIMETYPE;
	}
	static isFolderLike(node: NodeLike | NodeMetadata): node is FolderNode | SmartFolderNode {
		return Nodes.isFolder(node) || Nodes.isSmartFolder(node);
	}

	static isMetaNode(node: NodeLike | NodeMetadata): node is MetaNode {
		return node.mimetype === Nodes.META_NODE_MIMETYPE;
	}

	static isArticle(node: NodeLike | NodeMetadata): node is FileNode {
		return node.mimetype === Nodes.ARTICLE_MIMETYPE;
	}

	static isJavascript(file: File) {
		return (
			file.type.startsWith("application/javascript") ||
			file.type.startsWith("text/javascript")
		);
	}

	static isFile(node: NodeLike | NodeMetadata): node is FileNode {
		return !node.mimetype.startsWith("application/vnd.antbox");
	}

	static hasAspects(node: NodeLike | NodeMetadata): node is FileNode | FolderNode | MetaNode {
		return Nodes.isMetaNode(node) || Nodes.isFile(node) || Nodes.isFolder(node);
	}

	static isFileLike(
		node: NodeLike | NodeMetadata,
	): node is FileNode {
		return Nodes.isFile(node);
	}

	static isTextPlain(node: NodeLike | NodeMetadata) {
		return node.mimetype === "text/plain";
	}

	static isHtml(node: NodeLike | NodeMetadata) {
		return node.mimetype === "text/html";
	}

	static isMarkdown(node: NodeLike | NodeMetadata) {
		return node.mimetype === "text/markdown";
	}
}
