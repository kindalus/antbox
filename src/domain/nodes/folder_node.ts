import { Group } from "../auth/group.ts";

import { Node, Permissions } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";
import { UserNode } from "./user_node.ts";

export class FolderNode extends Node {
	static ROOT_FOLDER = FolderNode.#buildRootFolder();
	static ASPECTS_FOLDER = FolderNode.#buildAspectsFolder();
	static USERS_FOLDER = FolderNode.#buildUsersFolder();
	static GROUPS_FOLDER = FolderNode.#buildGroupsFolder();
	static SYSTEM_FOLDER = FolderNode.#buildSystemFolder();
	static ACTIONS_FOLDER = FolderNode.#buildActionsFolder();
	static EXT_FOLDER = FolderNode.#buildExtFolder();
	static FORMS_SPECIFICICATIONS_FOLDER = FolderNode.#buildFormSpecificationsFolder();
	static API_KEYS_FOLDER = FolderNode.#buildApiKeysFolder();

	static SYSTEM_FOLDERS = [
		FolderNode.ASPECTS_FOLDER,
		FolderNode.USERS_FOLDER,
		FolderNode.GROUPS_FOLDER,
		FolderNode.ACTIONS_FOLDER,
		FolderNode.EXT_FOLDER,
		FolderNode.FORMS_SPECIFICICATIONS_FOLDER,
		FolderNode.API_KEYS_FOLDER,
	];

	static #buildRootFolder(): FolderNode {
		const root = new FolderNode();
		root.uuid = Node.ROOT_FOLDER_UUID;
		root.fid = Node.ROOT_FOLDER_UUID;
		root.title = "";
		return root;
	}

	static #buildActionsFolder(): FolderNode {
		return FolderNode.#createSystemFolderMetadata(
			Node.ACTIONS_FOLDER_UUID,
			Node.ACTIONS_FOLDER_UUID,
			"Actions",
			Node.SYSTEM_FOLDER_UUID,
		);
	}

	static #buildSystemFolder(): FolderNode {
		return FolderNode.#createSystemFolderMetadata(
			Node.SYSTEM_FOLDER_UUID,
			Node.SYSTEM_FOLDER_UUID,
			"__System__",
			Node.ROOT_FOLDER_UUID,
		);
	}

	static #buildAspectsFolder(): FolderNode {
		const node = FolderNode.#createSystemFolderMetadata(
			Node.ASPECTS_FOLDER_UUID,
			Node.ASPECTS_FOLDER_UUID,
			"Aspects",
			Node.SYSTEM_FOLDER_UUID,
		);

		node.permissions = {
			group: ["Read"],
			authenticated: [],
			anonymous: [],
		};

		return node;
	}

	static #buildUsersFolder(): FolderNode {
		return FolderNode.#createSystemFolderMetadata(
			Node.USERS_FOLDER_UUID,
			Node.USERS_FOLDER_UUID,
			"Users",
			Node.SYSTEM_FOLDER_UUID,
		);
	}

	static #buildGroupsFolder(): FolderNode {
		return FolderNode.#createSystemFolderMetadata(
			Node.GROUPS_FOLDER_UUID,
			Node.GROUPS_FOLDER_UUID,
			"Groups",
			Node.SYSTEM_FOLDER_UUID,
		);
	}

	static #buildExtFolder(): FolderNode {
		return FolderNode.#createSystemFolderMetadata(
			Node.EXT_FOLDER_UUID,
			Node.EXT_FOLDER_UUID,
			"Extensions",
			Node.SYSTEM_FOLDER_UUID,
		);
	}

	static #buildFormSpecificationsFolder(): FolderNode {
		return FolderNode.#createSystemFolderMetadata(
			Node.FORMS_SPECIFICATIONS_FOLDER_UUID,
			Node.FORMS_SPECIFICATIONS_FOLDER_UUID,
			"Forms Specifications",
			Node.SYSTEM_FOLDER_UUID,
		);
	}

	static #buildApiKeysFolder(): FolderNode {
		return FolderNode.#createSystemFolderMetadata(
			Node.API_KEYS_FOLDER_UUID,
			Node.API_KEYS_FOLDER_UUID,
			"API Keys",
			Node.SYSTEM_FOLDER_UUID,
		);
	}

	static #createSystemFolderMetadata(
		uuid: string,
		fid: string,
		title: string,
		parent: string,
	): FolderNode {
		const childFilters: NodeFilter[] = [];

		switch (uuid) {
			case Node.ROOT_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.FOLDER_MIMETYPE]);
				break;
			case Node.ASPECTS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.ASPECT_MIMETYPE]);
				break;
			case Node.USERS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.USER_MIMETYPE]);
				break;
			case Node.GROUPS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.GROUP_MIMETYPE]);
				break;
			case Node.ACTIONS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.ACTION_MIMETYPE]);
				break;
			case Node.EXT_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.EXT_MIMETYPE]);
				break;
			case Node.FORMS_SPECIFICATIONS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.FORM_SPECIFICATION_MIMETYPE]);
				break;
			case Node.API_KEYS_FOLDER_UUID:
				childFilters.push(["mimetype", "==", Node.API_KEY_MIMETYPE]);
				break;
		}

		return Object.assign(new FolderNode(), {
			uuid,
			fid,
			title,
			parent,
			owner: UserNode.ROOT_USER_EMAIL,
			group: Group.ADMINS_GROUP_UUID,
			permissions: {
				group: ["Read", "Write", "Export"],
				authenticated: [],
				anonymous: [],
				advanced: {},
			},
			childFilters,
		});
	}

	static isSystemFolder(uuid: string): boolean {
		return this.SYSTEM_FOLDERS.some((folder) => folder.uuid === uuid);
	}

	onCreate: string[] = [];
	onUpdate: string[] = [];
	group: string = null as unknown as string;
	permissions: Permissions = {
		group: ["Read", "Write", "Export"],
		authenticated: ["Read", "Export"],
		anonymous: [],
		advanced: {},
	};

	childFilters: NodeFilter[] = [];

	constructor() {
		super();
		this.mimetype = Node.FOLDER_MIMETYPE;
	}

	isAspectsFolder(): boolean {
		return this.uuid === Node.ASPECTS_FOLDER_UUID;
	}

	isActionsFolder(): boolean {
		return this.uuid === Node.ACTIONS_FOLDER_UUID;
	}

	isApiKeysFolder(): boolean {
		return this.uuid === Node.API_KEYS_FOLDER_UUID;
	}
}
