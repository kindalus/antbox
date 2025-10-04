import { FolderNode } from "domain/nodes/folder_node.ts";

export class Folders {
	static ROOT_FOLDER_UUID = "--root--";
	static USERS_FOLDER_UUID = "--users--";
	static GROUPS_FOLDER_UUID = "--groups--";
	static ASPECTS_FOLDER_UUID = "--aspects--";
	static SYSTEM_FOLDER_UUID = "--system--";
	static API_KEYS_FOLDER_UUID = "--api-keys--";

	static FEATURES_FOLDER_UUID = "--features--";
	static AGENTS_FOLDER_UUID = "--agents--";

	static SYSTEM_FOLDERS_UUID = [
		Folders.USERS_FOLDER_UUID,
		Folders.GROUPS_FOLDER_UUID,
		Folders.ASPECTS_FOLDER_UUID,
		Folders.SYSTEM_FOLDER_UUID,
		Folders.API_KEYS_FOLDER_UUID,

		Folders.FEATURES_FOLDER_UUID,
		Folders.AGENTS_FOLDER_UUID,
	];

	static isRootFolder(node: FolderNode): boolean {
		return node.uuid === Folders.ROOT_FOLDER_UUID;
	}

	static isSystemRootFolder(node: FolderNode): boolean {
		return node.uuid === Folders.SYSTEM_FOLDER_UUID;
	}

	static isAspectsFolder(node: FolderNode): boolean {
		return node.uuid === Folders.ASPECTS_FOLDER_UUID;
	}

	static isApiKeysFolder(node: FolderNode): boolean {
		return node.uuid === Folders.API_KEYS_FOLDER_UUID;
	}

	static isFeaturesFolder(node: FolderNode): boolean {
		return node.uuid === Folders.FEATURES_FOLDER_UUID;
	}

	static isAgentsFolder(node: FolderNode): boolean {
		return node.uuid === Folders.AGENTS_FOLDER_UUID;
	}

	static isSystemFolder(uuid: string): boolean {
		return Folders.SYSTEM_FOLDERS_UUID.some((folder) => folder === uuid);
	}

	private constructor() {}
}
