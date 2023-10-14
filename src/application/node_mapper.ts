import { Action } from "../domain/actions/action.ts";
import { Aspect } from "../domain/aspects/aspect.ts";
import { Group } from "../domain/auth/group.ts";
import { User } from "../domain/auth/user.ts";
import { GroupNode } from "../domain/nodes/group_node.ts";
import { Node } from "../domain/nodes/node.ts";
import { UserNode } from "../domain/nodes/user_node.ts";
import { OcrTemplate } from "../domain/orc_templates/ocr_template.ts";

export function fileToAspect(file: File): Promise<Aspect> {
	return file
		.text()
		.then((text) => JSON.parse(text))
		.then((raw) => ({
			uuid: raw.uuid ?? file.name.split(".")[0],
			title: raw.title ?? file.name.split(".")[0],
			description: raw.description ?? "",
			builtIn: false,
			filters: raw.filters ?? [],
			properties: raw.properties ?? [],
		}));
}

export function fileToOcrTemplate(file: File): Promise<OcrTemplate> {
	return file
		.text()
		.then((text) => JSON.parse(text))
		.then((raw) => ({
			uuid: raw.uuid ?? file.name.split(".")[0],
			title: raw.title ?? file.name.split(".")[0],
			description: raw.description ?? "",
			builtIn: false,
			viewport: raw.viewport ?? { x: 0, y: 0, width: 595, height: 842 },
			sourceImageUrl: raw.sourceImageUrl,
			targetAspect: raw.targetAspect,
			properties: raw.properties ?? [],
		}));
}

export function aspectToFile(aspect: Aspect): File {
	const raw = JSON.stringify(
		{
			uuid: aspect.uuid,
			title: aspect.title ?? aspect.uuid,
			description: aspect.description,
			builtIn: aspect.builtIn ?? false,
			filters: aspect.filters ?? [],
			properties: aspect.properties ?? [],
		},
		null,
		4,
	);

	const f = new File([raw], aspect.uuid + ".json", {
		type: "application/json",
	});

	return f;
}

export function nodeToUser(node: UserNode): User {
	return Object.assign(new User(), {
		uuid: node.uuid,
		fullname: node.title,
		email: node.email,
		group: node.group,
		groups: [...(node.groups ?? [])],
	});
}

export function userToNode(user: User): UserNode {
	const node = Object.assign(new UserNode(), {
		uuid: user.uuid,
		fid: user.uuid,
		title: user.fullname,
		mimetype: Node.USER_MIMETYPE,
		size: 0,
		parent: Node.USERS_FOLDER_UUID,

		email: user.email,
		group: user.group,
		groups: [...(user.groups ?? [])],

		createdTime: nowIso(),
		modifiedTime: nowIso(),
	});

	if (user.builtIn) {
		node.owner = User.ROOT_USER_EMAIL;
	}

	return node;
}

export function groupToNode(group: Group): GroupNode {
	const node = Object.assign(new GroupNode(), {
		uuid: group.uuid,
		fid: group.uuid,
		title: group.title,
	});

	if (group.builtIn) {
		node.owner = User.ROOT_USER_EMAIL;
	}

	return node;
}

export function nodeToGroup(node: GroupNode): Group {
	return Object.assign(new Group(), {
		uuid: node.uuid,
		fid: node.uuid,
		title: node.title,
		description: node.description,
		builtIn: node.owner === User.ROOT_USER_EMAIL,
	});
}

export function aspectToNode(aspect: Aspect): Node {
	return Object.assign(new Node(), {
		uuid: aspect.uuid,
		fid: aspect.uuid,
		title: aspect.title,
		mimetype: Node.ASPECT_MIMETYPE,
		size: 0,
		parent: Node.ASPECTS_FOLDER_UUID,

		createdTime: nowIso(),
		modifiedTime: nowIso(),
	});
}

export function actionToNode(action: Action): Node {
	return Object.assign(new Node(), {
		uuid: action.uuid,
		fid: action.uuid,
		title: action.title,

		mimetype: Node.ACTION_MIMETYPE,
		size: 0,
		parent: Node.ACTIONS_FOLDER_UUID,

		createdTime: nowIso(),
		modifiedTime: nowIso(),
	});
}

function nowIso() {
	return new Date().toISOString();
}
