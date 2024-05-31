import { ActionNode } from "../actions/action_node.ts";
import { AspectNode } from "../aspects/aspect_node.ts";
import { FormSpecificationNode } from "../forms_specifications/form_specification.ts";
import { ApiKeyNode } from "./api_key_node.ts";
import { FolderNode } from "./folder_node.ts";
import { GroupNode } from "./group_node.ts";
import { Node } from "./node.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";
import { UserNode } from "./user_node.ts";

function templateFromMimetype<T extends Node>(
	mimetype?: string,
): T {
	let node: Node;
	switch (mimetype) {
		case Node.ACTION_MIMETYPE:
			node = new ActionNode();
			break;
		case Node.API_KEY_MIMETYPE:
			node = new ApiKeyNode();
			break;
		case Node.ASPECT_MIMETYPE:
			node = new AspectNode();
			break;
		case Node.FOLDER_MIMETYPE:
			node = new FolderNode();
			break;
		case Node.FORM_SPECIFICATION_MIMETYPE:
			node = new FormSpecificationNode();
			break;
		case Node.GROUP_MIMETYPE:
			node = new GroupNode();
			break;
		case Node.META_NODE_MIMETYPE:
			node = new Node();
			break;
		case Node.SMART_FOLDER_MIMETYPE:
			node = new SmartFolderNode();
			break;
		case Node.USER_MIMETYPE:
			node = new UserNode();
			break;
		default:
			node = new Node();
			break;
	}

	return node as T;
}

function compose(...p: Partial<Node>[]): Node {
	const mimetype = p.find((n) => n.mimetype)?.mimetype;

	const template = templateFromMimetype(mimetype);

	return Object.assign(template, ...p);
}

function createMetadata(
	uuid: string,
	fid: string,
	mimetype: string,
	size: number,
	metadata: Partial<Node>,
): Node {
	return compose(
		extractMetadata({ ...metadata, mimetype }),
		{
			mimetype: mimetype === "text/javascript" ? "application/javascript" : mimetype,
		},
		{ uuid, fid, size },
	);
}

function extractMetadata<T extends Node>(
	metadata: Partial<Node | FolderNode>,
): Partial<T> {
	const template = templateFromMimetype(metadata.mimetype ?? Node.META_NODE_MIMETYPE);
	const final: Record<string, unknown> = {};

	for (const key in template) {
		if (key in metadata) {
			final[key] = (metadata as Record<string, unknown>)[key];
		}
	}

	return {
		...final,
		aspects: final.aspects ?? [],
		properties: final.properties ?? {},
		owner: final.owner ?? UserNode.ROOT_USER_EMAIL,
	} as Partial<T>;
}

export const NodeFactory = {
	templateFromMimetype,
	compose,
	extractMetadata,
	createMetadata,
};
