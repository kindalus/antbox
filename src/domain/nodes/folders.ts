import { Groups } from "../auth/groups.ts";
import { Users } from "../auth/users.ts";
import { FolderNode } from "./folder_node.ts";
import { NodeFilter } from "./node_filter.ts";
import { NodeMetadata } from "./node_metadata.ts";
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
	// TODO: Uncomment code
	/*
	static ROOT_FOLDER = Folders.#buildRootFolder();
	static ASPECTS_FOLDER = Folders.#buildAspectsFolder();
	static USERS_FOLDER = Folders.#buildUsersFolder();
	static GROUPS_FOLDER = Folders.#buildGroupsFolder();
	static SYSTEM_FOLDER = Folders.#buildSystemFolder();
	static ACTIONS_FOLDER = Folders.#buildActionsFolder();
	static EXT_FOLDER = Folders.#buildExtFolder();
	static FORMS_SPECIFICICATIONS_FOLDER = Folders.#buildFormSpecificationsFolder();
	static API_KEYS_FOLDER = Folders.#buildApiKeysFolder();

	static SYSTEM_FOLDERS = [
		Folders.ASPECTS_FOLDER,
		Folders.USERS_FOLDER,
		Folders.GROUPS_FOLDER,
		Folders.ACTIONS_FOLDER,
		Folders.EXT_FOLDER,
		Folders.FORMS_SPECIFICICATIONS_FOLDER,
		Folders.API_KEYS_FOLDER,
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

	static #buildRootFolder(): FolderNode {
		return FolderNode.create(
			{
				uuid: Folders.ROOT_FOLDER_UUID,
				fid: Folders.ROOT_FOLDER_UUID,
				title: "",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: Users.ROOT_USER_EMAIL,
				group: Groups.ADMINS_GROUP_UUID,
				permissions: {
					group: ["Read"],
					authenticated: [],
					anonymous: [],
					advanced: {},
				},
			},
		).right;
	}

	static #buildActionsFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Folders.ACTIONS_FOLDER_UUID,
			Folders.ACTIONS_FOLDER_UUID,
			"Actions",
			Folders.SYSTEM_FOLDER_UUID,
		)).right;
	}

	static #buildSystemFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Folders.SYSTEM_FOLDER_UUID,
			Folders.SYSTEM_FOLDER_UUID,
			"__System__",
			Folders.ROOT_FOLDER_UUID,
		)).right;
	}

	static #buildAspectsFolder(): FolderNode {
		const metadata = Folders.#createSystemFolderMetadata(
			Folders.ASPECTS_FOLDER_UUID,
			Folders.ASPECTS_FOLDER_UUID,
			"Aspects",
			Folders.SYSTEM_FOLDER_UUID,
		);

		metadata.permissions = {
			group: ["Read"],
			authenticated: [],
			anonymous: [],
		};

		return FolderNode.create(metadata).value as FolderNode;
	}

	static #buildUsersFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Folders.USERS_FOLDER_UUID,
			Folders.USERS_FOLDER_UUID,
			"Users",
			Folders.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildGroupsFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Folders.GROUPS_FOLDER_UUID,
			Folders.GROUPS_FOLDER_UUID,
			"Groups",
			Folders.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildExtFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Folders.EXT_FOLDER_UUID,
			Folders.EXT_FOLDER_UUID,
			"Extensions",
			Folders.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildFormSpecificationsFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Folders.FORMS_SPECIFICATIONS_FOLDER_UUID,
			Folders.FORMS_SPECIFICATIONS_FOLDER_UUID,
			"Forms Specifications",
			Folders.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildApiKeysFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Folders.API_KEYS_FOLDER_UUID,
			Folders.API_KEYS_FOLDER_UUID,
			"API Keys",
			Folders.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #createSystemFolderMetadata(
		uuid: string,
		fid: string,
		title: string,
		parent: string,
	): Partial<NodeMetadata> {
		const childFilters: NodeFilter[] = [];

		switch (uuid) {
			case Folders.ROOT_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.FOLDER_MIMETYPE]);
				break;
			case Folders.ASPECTS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.ASPECT_MIMETYPE]);
				break;
			case Folders.USERS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.USER_MIMETYPE]);
				break;
			case Folders.GROUPS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.GROUP_MIMETYPE]);
				break;
			case Folders.ACTIONS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.ACTION_MIMETYPE]);
				break;
			case Folders.EXT_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.EXT_MIMETYPE]);
				break;
			case Folders.FORMS_SPECIFICATIONS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.FORM_SPECIFICATION_MIMETYPE]);
				break;
			case Folders.API_KEYS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.API_KEY_MIMETYPE]);
				break;
		}

		return {
			uuid,
			fid,
			title,
			parent,
			owner: Users.ROOT_USER_EMAIL,
			group: Groups.ADMINS_GROUP_UUID,
			permissions: {
				group: ["Read", "Write", "Export"],
				authenticated: [],
				anonymous: [],
				advanced: {},
			},
			childFilters,
		};
	}

	static isSystemFolder(uuid: string): boolean {
		return this.SYSTEM_FOLDERS.some((folder) => folder.uuid === uuid);
	}
	*/
}
