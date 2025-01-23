// deno-lint-ignore-file no-explicit-any

import { ActionNode } from "../actions/action_node.ts";
import { ExtNode } from "./ext_node.ts";
import { FileNode } from "./file_node.ts";
import { FolderNode } from "./folder_node.ts";
import { MetaNode } from "./meta_node.ts";
import { NodeLike } from "./node_like.ts";

export class Nodes {
	static FID_PREFIX = "--fid--";

	static FOLDER_MIMETYPE = "application/vnd.antbox.folder";
	static META_NODE_MIMETYPE = "application/vnd.antbox.metanode";
	static SMART_FOLDER_MIMETYPE = "application/vnd.antbox.smartfolder";
	static ASPECT_MIMETYPE = "application/vnd.antbox.aspect";
	static ACTION_MIMETYPE = "application/vnd.antbox.action";
	static EXT_MIMETYPE = "application/vnd.antbox.extension";
	static USER_MIMETYPE = "application/vnd.antbox.user";
	static GROUP_MIMETYPE = "application/vnd.antbox.group";
	static FORM_SPECIFICATION_MIMETYPE = "application/vnd.antbox.formspecification";
	static API_KEY_MIMETYPE = "application/vnd.antbox.apikey";

	static ROOT_FOLDER_UUID = "--root--";
	static USERS_FOLDER_UUID = "--users--";
	static GROUPS_FOLDER_UUID = "--groups--";
	static ASPECTS_FOLDER_UUID = "--aspects--";
	static ACTIONS_FOLDER_UUID = "--actions--";
	static EXT_FOLDER_UUID = "--ext--";
	static SYSTEM_FOLDER_UUID = "--system--";
	static FORMS_SPECIFICATIONS_FOLDER_UUID = "--forms-specifications--";
	static API_KEYS_FOLDER_UUID = "--api-keys--";

	static SYSTEM_MIMETYPES = [
		Nodes.ASPECT_MIMETYPE,
		Nodes.ACTION_MIMETYPE,
		Nodes.EXT_MIMETYPE,
		Nodes.USER_MIMETYPE,
		Nodes.GROUP_MIMETYPE,
		Nodes.FORM_SPECIFICATION_MIMETYPE,
		Nodes.API_KEY_MIMETYPE,
	];

	static fidToUuid(fid: string): string {
		return `${Nodes.FID_PREFIX}${fid}`;
	}

	static isFid(uuid: string): boolean {
		return uuid?.startsWith(Nodes.FID_PREFIX);
	}

	static uuidToFid(fid: string): string {
		return fid?.startsWith(Nodes.FID_PREFIX) ? fid.substring(Nodes.FID_PREFIX.length) : fid;
	}

	static isRootFolder(uuid: string): boolean {
		return uuid === Nodes.ROOT_FOLDER_UUID;
	}

	static isSystemRootFolder(uuid: string): boolean {
		return uuid === Nodes.SYSTEM_FOLDER_UUID;
	}

	static isFolder(metadata: Partial<Record<string, any>>): boolean {
		return metadata?.mimetype === Nodes.FOLDER_MIMETYPE;
	}

	static isUser(metadata: Partial<Record<string, any>>): boolean {
		return metadata?.mimetype === Nodes.USER_MIMETYPE;
	}

	static isApikey(metadata: Partial<Record<string, any>>): boolean {
		return metadata?.mimetype === Nodes.API_KEY_MIMETYPE;
	}

	static isSmartFolder(metadata: Partial<Record<string, any>>): boolean {
		return metadata?.mimetype === Nodes.SMART_FOLDER_MIMETYPE;
	}

	static isAspect(metadata: Partial<Record<string, any>>): boolean {
		return metadata?.mimetype === Nodes.ASPECT_MIMETYPE;
	}

	static isJavascript(file: File) {
		return (
			file.type === "application/javascript" || file.type === "text/javascript"
		);
	}

	static isFile(node: NodeLike): node is FileNode {
		return node.isFile();
	}

	static hasAspects(node: NodeLike): node is FileNode | FolderNode | MetaNode {
		return node.isFile() || node.isFolder() || node.isMetaNode();
	}

	static isFileLike(node: NodeLike): node is FileNode | ExtNode | ActionNode {
		return node.isFile() || node.isExt() || node.isAction();
	}
}
