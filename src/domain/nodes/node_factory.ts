import { Group } from "../auth/group.ts";
import { User } from "../auth/user.ts";
import { ApiKeyNode } from "./api_key_node.ts";
import { FolderNode } from "./folder_node.ts";
import { GroupNode } from "./group_node.ts";
import { Node } from "./node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";
import { UserNode } from "./user_node.ts";

function fromMimetype(
	mimetype: string,
): Node | Node | SmartFolderNode | FolderNode | GroupNode | UserNode | ApiKeyNode {
	switch (mimetype) {
		case Node.FOLDER_MIMETYPE:
			return new FolderNode();
		case Node.SMART_FOLDER_MIMETYPE:
			return new SmartFolderNode();
		case Node.META_NODE_MIMETYPE:
			return new Node();
		case Node.GROUP_MIMETYPE:
			return new GroupNode();
		case Node.USER_MIMETYPE:
			return new UserNode();
		case Node.API_KEY_MIMETYPE:
			return new ApiKeyNode();
		default:
			return new Node();
	}
}

function fromJson(
	json: unknown,
): Node | Node | SmartFolderNode | FolderNode {
	const node = Object.assign(
		fromMimetype((json as { mimetype: string }).mimetype),
		json,
	);

	return node;
}

function compose(...p: Partial<Node>[]): Node {
	const mimetype = p.find((n) => n.mimetype)?.mimetype;
	return Object.assign(fromMimetype(mimetype!), ...p);
}

function createMetadata(
	uuid: string,
	fid: string,
	mimetype: string,
	size: number,
	metadata: Partial<Node>,
): Node {
	return compose(
		{
			uuid,
			fid,

			size,
		},
		extractMetadata(metadata),
		{
			mimetype: mimetype === "text/javascript" ? "application/javascript" : mimetype,
		},
	) as Node;
}

function extractMetadata(
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
			...extractFolderMetadataFields(metadata),
		};
	}

	if (Node.isUser(metadata)) {
		return {
			...node,
			...extractUserMetadataFields(metadata),
		};
	}

	if (Node.isApikey(metadata)) {
		return {
			...node,
			...extractApikeyMetadataFields(metadata),
		};
	}

	if (Node.isSmartFolder(metadata)) {
		return {
			...node,
			...extractSmartFolderMetadataFields(metadata),
		};
	}

	return node;
}

function extractSmartFolderMetadataFields(
	metadata: Partial<SmartFolderNode>,
): Partial<SmartFolderNode> {
	return {
		filters: metadata.filters ?? [],
		aggregations: metadata.aggregations ?? [],
	};
}

function extractFolderMetadataFields(metadata: Partial<FolderNode>): Partial<FolderNode> {
	const folderNode: Partial<FolderNode> = {
		group: metadata.group ?? Group.ADMINS_GROUP_UUID,
	};

	if (metadata.permissions) {
		folderNode.permissions = { ...metadata.permissions };
	}

	return folderNode;
}

function extractUserMetadataFields(metadata: Partial<UserNode>): Partial<UserNode> {
	return {
		email: metadata.email ?? "",
		group: metadata.group ?? Group.ADMINS_GROUP_UUID,
		groups: metadata.groups ?? [],
	};
}

function extractApikeyMetadataFields(metadata: Partial<ApiKeyNode>): Partial<ApiKeyNode> {
	return {
		group: metadata.group,
		secret: metadata.secret,
	};
}

export const NodeFactory = {
	fromJson,
	fromMimetype,
	compose,
	extractMetadata,
	createMetadata,
};
