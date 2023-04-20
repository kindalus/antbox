import { Group } from "../auth/group.ts";
import { User } from "/domain/auth/user.ts";
import { Node, Permissions } from "/domain/nodes/node.ts";

export class FolderNode extends Node {
	static ROOT_FOLDER = FolderNode.#buildRootFolder();
	static ASPECTS_FOLDER = FolderNode.#buildAspectsFolder();
	static USERS_FOLDER = FolderNode.#buildUsersFolder();
	static GROUPS_FOLDER = FolderNode.#buildGroupsFolder();
	static SYSTEM_FOLDER = FolderNode.#buildSystemFolder();
	static ACTIONS_FOLDER = FolderNode.#buildActionsFolder();
	static EXT_FOLDER = FolderNode.#buildExtFolder();

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
		return FolderNode.#createSystemFolderMetadata(
			Node.ASPECTS_FOLDER_UUID,
			Node.ASPECTS_FOLDER_UUID,
			"Aspects",
			Node.SYSTEM_FOLDER_UUID,
		);
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

	static #createSystemFolderMetadata(
		uuid: string,
		fid: string,
		title: string,
		parent: string,
	): FolderNode {
		return Object.assign(new FolderNode(), {
			uuid,
			fid,
			title,
			parent,
			owner: User.ROOT_USER_EMAIL,
			group: Group.ADMINS_GROUP_UUID,
		});
	}

	onCreate: string[] = [];
	onUpdate: string[] = [];
	group: string = null as unknown as string;
	permissions: Permissions = {
		group: ["Read", "Write", "Export"],
		authenticated: ["Read", "Export"],
		anonymous: [],
	};

	constructor() {
		super();
		this.mimetype = Node.FOLDER_MIMETYPE;
	}
}
