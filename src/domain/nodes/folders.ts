import { FolderNode } from "./folder_node.ts";
import { Nodes } from "./nodes.ts";

export class Folders {
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

	static SYSTEM_FOLDERS_UUID = [
		Folders.USERS_FOLDER_UUID,
		Folders.GROUPS_FOLDER_UUID,
		Folders.ASPECTS_FOLDER_UUID,
		Folders.ACTIONS_FOLDER_UUID,
		Folders.EXT_FOLDER_UUID,
		Folders.SYSTEM_FOLDER_UUID,
		Folders.FORMS_SPECIFICATIONS_FOLDER_UUID,
		Folders.API_KEYS_FOLDER_UUID,
	];

	static isRootFolder(node: FolderNode): boolean {
		return node.uuid === Folders.ROOT_FOLDER_UUID;
	}

	static isSystemRootFolder(node: FolderNode): boolean {
		return node.uuid === Folders.SYSTEM_FOLDER_UUID;
	}

	isAspectsFolder(node: FolderNode): boolean {
		return node.uuid === Folders.ASPECTS_FOLDER_UUID;
	}

	isActionsFolder(node: FolderNode): boolean {
		return node.uuid === Folders.ACTIONS_FOLDER_UUID;
	}

	isApiKeysFolder(node: FolderNode): boolean {
		return node.uuid === Folders.API_KEYS_FOLDER_UUID;
	}

	static isSystemFolder(uuid: string): boolean {
		return this.SYSTEM_FOLDERS_UUID.some((folder) => folder === uuid);
	}
}
