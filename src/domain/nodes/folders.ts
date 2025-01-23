import { Groups } from "../auth/groups.ts";
import { Users } from "../auth/users.ts";
import { FolderNode } from "./folder_node.ts";
import { NodeFilter } from "./node_filter.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Nodes } from "./nodes.ts";

export class Folders {
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

	static #buildRootFolder(): FolderNode {
		const root = FolderNode.create(
			{
				uuid: Nodes.ROOT_FOLDER_UUID,
				fid: Nodes.ROOT_FOLDER_UUID,
				title: "",
				parent: Nodes.ROOT_FOLDER_UUID,
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

		root.uuid = Nodes.ROOT_FOLDER_UUID;
		root.fid = Nodes.ROOT_FOLDER_UUID;
		root.title = "";
		return root;
	}

	static #buildActionsFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Nodes.ACTIONS_FOLDER_UUID,
			Nodes.ACTIONS_FOLDER_UUID,
			"Actions",
			Nodes.SYSTEM_FOLDER_UUID,
		)).right;
	}

	static #buildSystemFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Nodes.SYSTEM_FOLDER_UUID,
			Nodes.SYSTEM_FOLDER_UUID,
			"__System__",
			Nodes.ROOT_FOLDER_UUID,
		)).right;
	}

	static #buildAspectsFolder(): FolderNode {
		const metadata = Folders.#createSystemFolderMetadata(
			Nodes.ASPECTS_FOLDER_UUID,
			Nodes.ASPECTS_FOLDER_UUID,
			"Aspects",
			Nodes.SYSTEM_FOLDER_UUID,
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
			Nodes.USERS_FOLDER_UUID,
			Nodes.USERS_FOLDER_UUID,
			"Users",
			Nodes.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildGroupsFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Nodes.GROUPS_FOLDER_UUID,
			Nodes.GROUPS_FOLDER_UUID,
			"Groups",
			Nodes.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildExtFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Nodes.EXT_FOLDER_UUID,
			Nodes.EXT_FOLDER_UUID,
			"Extensions",
			Nodes.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildFormSpecificationsFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Nodes.FORMS_SPECIFICATIONS_FOLDER_UUID,
			Nodes.FORMS_SPECIFICATIONS_FOLDER_UUID,
			"Forms Specifications",
			Nodes.SYSTEM_FOLDER_UUID,
		)).value as FolderNode;
	}

	static #buildApiKeysFolder(): FolderNode {
		return FolderNode.create(Folders.#createSystemFolderMetadata(
			Nodes.API_KEYS_FOLDER_UUID,
			Nodes.API_KEYS_FOLDER_UUID,
			"API Keys",
			Nodes.SYSTEM_FOLDER_UUID,
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
			case Nodes.ROOT_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.FOLDER_MIMETYPE]);
				break;
			case Nodes.ASPECTS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.ASPECT_MIMETYPE]);
				break;
			case Nodes.USERS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.USER_MIMETYPE]);
				break;
			case Nodes.GROUPS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.GROUP_MIMETYPE]);
				break;
			case Nodes.ACTIONS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.ACTION_MIMETYPE]);
				break;
			case Nodes.EXT_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.EXT_MIMETYPE]);
				break;
			case Nodes.FORMS_SPECIFICATIONS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Nodes.FORM_SPECIFICATION_MIMETYPE]);
				break;
			case Nodes.API_KEYS_FOLDER_UUID:
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
}
