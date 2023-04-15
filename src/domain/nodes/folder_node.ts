import { Node, Permissions } from "./node.ts";

export class FolderNode extends Node {
	static ROOT_FOLDER = FolderNode.buildRootFolder();
	static ASPECTS_FOLDER = FolderNode.buildAspectsFolder();

	private static buildRootFolder(): FolderNode {
		const root = new FolderNode();
		root.uuid = Node.ROOT_FOLDER_UUID;
		root.fid = Node.ROOT_FOLDER_UUID;
		root.title = "";
		return root;
	}

	private static buildAspectsFolder(): FolderNode {
		const aspectsFolder = new FolderNode();
		aspectsFolder.uuid = Node.ASPECTS_FOLDER_UUID;
		aspectsFolder.fid = Node.ASPECTS_FOLDER_UUID;
		aspectsFolder.title = "Aspects";
		aspectsFolder.parent = Node.ROOT_FOLDER_UUID;
		return aspectsFolder;
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
