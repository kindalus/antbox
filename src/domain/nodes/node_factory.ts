import { Group } from "../auth/group.ts";
import { User } from "../auth/user.ts";
import { FolderNode } from "./folder_node.ts";
import { FileNode, Node } from "./node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";

export class NodeFactory {
	static fromMimetype(
		mimetype: string,
	): Node | FileNode | SmartFolderNode | FolderNode {
		switch (mimetype) {
			case Node.FOLDER_MIMETYPE:
				return new FolderNode();
			case Node.SMART_FOLDER_MIMETYPE:
				return new SmartFolderNode();
			case Node.META_NODE_MIMETYPE:
				return new Node();
			default:
				return new FileNode();
		}
	}

	static fromJson(
		json: unknown,
	): Node | FileNode | SmartFolderNode | FolderNode {
		const node = Object.assign(
			NodeFactory.fromMimetype((json as { mimetype: string }).mimetype),
			json,
		);

		return node;
	}

	static composeSmartFolder(...p: Partial<SmartFolderNode>[]): SmartFolderNode {
		return Object.assign(new SmartFolderNode(), ...p);
	}

	static composeFolder(...p: Partial<FolderNode>[]): FolderNode {
		return Object.assign(new FolderNode(), ...p);
	}

	static composeNode(...p: Partial<Node>[]): Node {
		const mimetype = p.find((n) => n.mimetype)?.mimetype;
		return Object.assign(NodeFactory.fromMimetype(mimetype!), ...p);
	}

	static createFileMetadata(
		uuid: string,
		fid: string,
		metadata: Partial<Node>,
		mimetype: string,
		size: number,
	): FileNode {
		return NodeFactory.composeNode(
			{
				uuid,
				fid,
				mimetype: mimetype === "text/javascript" ? "application/javascript" : mimetype,
				size,
			},
			this.extractMetadataFields(metadata),
		) as FileNode;
	}

	static createFolderMetadata(
		uuid: string,
		fid: string,
		metadata: Partial<Node>,
	): FolderNode {
		return NodeFactory.composeFolder(
			{
				uuid,
				fid,
				mimetype: Node.FOLDER_MIMETYPE,
				size: 0,
			},
			NodeFactory.extractMetadataFields(metadata),
		);
	}

	static extractMetadataFields(
		metadata: Partial<Node | FolderNode>,
	): Partial<Node> {
		const node = {
			parent: metadata.parent,
			title: metadata.title,
			aspects: metadata.aspects ?? [],
			description: metadata.description ?? "",
			properties: metadata.properties ?? {},
			owner: metadata.owner ?? User.ROOT_USER_EMAIL,
		};

		if (Node.isFolder(metadata)) {
			return {
				...node,
				...NodeFactory.extractFolderMetadataFields(metadata),
			};
		}

		return node;
	}

	private static extractFolderMetadataFields(metadata: Partial<FolderNode>): Partial<FolderNode> {
		const folderNode: Partial<FolderNode> = {
			group: metadata.group ?? Group.ADMINS_GROUP_UUID,
		};

		if (metadata.permissions) {
			folderNode.permissions = { ...metadata.permissions };
		}

		return folderNode;
	}
}
