import { ActionNode } from "../actions/action_node.ts";
import { AspectNode } from "../aspects/aspect_node.ts";
import { ApiKeyNode } from "./api_key_node.ts";
import { FolderNode } from "./folder_node.ts";
import { GroupNode } from "./group_node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";
import { UserNode } from "./user_node.ts";

export type Properties = Record<string, unknown>;

export class Node {
	static FOLDER_MIMETYPE = "application/vnd.antbox.folder";
	static META_NODE_MIMETYPE = "application/vnd.antbox.metanode";
	static SMART_FOLDER_MIMETYPE = "application/vnd.antbox.smartfolder";
	static ASPECT_MIMETYPE = "application/vnd.antbox.aspect";
	static ACTION_MIMETYPE = "application/vnd.antbox.action";
	static EXT_MIMETYPE = "application/vnd.antbox.extension";
	static USER_MIMETYPE = "application/vnd.antbox.user";
	static GROUP_MIMETYPE = "application/vnd.antbox.group";
	static OCR_TEMPLATE_MIMETYPE = "application/vnd.antbox.ocrtemplate";
	static API_KEY_MIMETYPE = "application/vnd.antbox.apikey";

	static ROOT_FOLDER_UUID = "--root--";
	static USERS_FOLDER_UUID = "--users--";
	static GROUPS_FOLDER_UUID = "--groups--";
	static ASPECTS_FOLDER_UUID = "--aspects--";
	static ACTIONS_FOLDER_UUID = "--actions--";
	static EXT_FOLDER_UUID = "--ext--";
	static SYSTEM_FOLDER_UUID = "--system--";
	static OCR_TEMPLATES_FOLDER_UUID = "--ocr-templates--";
	static API_KEYS_FOLDER_UUID = "--api-keys--";

	private static FID_PREFIX = "--fid--";

	static fidToUuid(fid: string): string {
		return `${Node.FID_PREFIX}${fid}`;
	}

	static isFid(uuid: string): boolean {
		return uuid?.startsWith(Node.FID_PREFIX);
	}

	static uuidToFid(fid: string): string {
		return fid?.startsWith(Node.FID_PREFIX) ? fid.substring(Node.FID_PREFIX.length) : fid;
	}

	static isRootFolder(uuid: string): boolean {
		return uuid === Node.ROOT_FOLDER_UUID;
	}

	static isFolder(metadata: Partial<Node>): boolean {
		return metadata?.mimetype === Node.FOLDER_MIMETYPE;
	}

	static isUser(metadata: Partial<Node>): boolean {
		return metadata?.mimetype === Node.USER_MIMETYPE;
	}

	static isApikey(metadata: Partial<Node>): boolean {
		return metadata?.mimetype === Node.API_KEY_MIMETYPE;
	}

	static isSmartFolder(metadata: Partial<Node>): boolean {
		return metadata?.mimetype === Node.SMART_FOLDER_MIMETYPE;
	}

	static isAspect(metadata: Partial<Node>): boolean {
		return metadata?.mimetype === Node.ASPECT_MIMETYPE;
	}

	uuid = "";
	fid = "";
	title = "";
	description?: string;
	mimetype = "";
	size = 0;
	aspects?: string[];
	parent = Node.ROOT_FOLDER_UUID;
	createdTime = "";
	modifiedTime = "";
	owner = "";
	properties: Properties = {};
	fulltext = "";

	constructor() {
		this.createdTime = this.modifiedTime = new Date().toISOString();
	}

	isJson(): boolean {
		return this.mimetype === "application/json";
	}

	isApikey(): this is ApiKeyNode {
		return this.mimetype === Node.API_KEY_MIMETYPE;
	}

	isFolder(): this is FolderNode {
		return this.mimetype === Node.FOLDER_MIMETYPE;
	}

	isMetaNode(): boolean {
		return this.mimetype === Node.META_NODE_MIMETYPE;
	}

	isSmartFolder(): this is SmartFolderNode {
		return this.mimetype === Node.SMART_FOLDER_MIMETYPE;
	}

	isFile(): this is Node {
		return this.mimetype.match(/^application\/vnd\.antbox\./) === null;
	}

	isRootFolder(): this is FolderNode {
		return this.uuid === Node.ROOT_FOLDER_UUID;
	}

	isSystemRootFolder(): this is FolderNode {
		return this.uuid === Node.SYSTEM_FOLDER_UUID;
	}

	isAspect(): this is AspectNode {
		return this.mimetype === Node.ASPECT_MIMETYPE;
	}

	isGroup(): this is GroupNode {
		return this.mimetype === Node.GROUP_MIMETYPE;
	}

	isUser(): this is UserNode {
		return this.mimetype === Node.USER_MIMETYPE;
	}

	isAction(): this is ActionNode {
		return this.mimetype === Node.ACTION_MIMETYPE;
	}

	static isJavascript(file: File) {
		return (
			file.type === "application/javascript" || file.type === "text/javascript"
		);
	}
}

export type Permission = "Read" | "Write" | "Export";

export type Permissions = {
	group: Permission[];
	authenticated: Permission[];
	anonymous: Permission[];
};
