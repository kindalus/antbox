import { Action } from "../domain/actions/action.ts";
import { Aspect } from "../domain/aspects/aspect.ts";
import { Group } from "../domain/auth/group.ts";
import { User } from "../domain/auth/user.ts";
import { Node } from "../domain/nodes/node.ts";

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

export function userToNode(user: User): Node {
	const node = {
		uuid: user.uuid,
		fid: user.uuid,
		title: user.fullname,
		mimetype: Node.META_NODE_MIMETYPE,
		size: 0,
		parent: Node.USERS_FOLDER_UUID,
		aspects: ["user"],
		properties: {
			"user:email": user.email,
			"user:group": user.group,
			"user:groups": user.groups,
		},

		createdTime: nowIso(),
		modifiedTime: nowIso(),
	} as unknown as Node;

	if (user.builtIn) {
		node.owner = User.ROOT_USER_EMAIL;
	}

	return node;
}

export function groupToNode(group: Group): Node {
	const node = Object.assign(new Node(), {
		uuid: group.uuid,
		fid: group.uuid,
		title: group.title,
		mimetype: Node.META_NODE_MIMETYPE,
		size: 0,

		aspects: ["group"],

		createdTime: nowIso(),
		modifiedTime: nowIso(),
	});

	if (group.builtIn) {
		node.owner = User.ROOT_USER_EMAIL;
	}

	return node;
}

export function nodeToUser(node: Node): User {
	return Object.assign(new User(), {
		uuid: node.uuid,
		fullname: node.title,
		email: node.properties["user:email"] as string,
		group: node.properties["user:group"] as string,
		groups: node.properties["user:groups"] as string[],
	});
}

export function aspectToNode(aspect: Aspect): Node {
	return Object.assign(new Node(), {
		uuid: aspect.uuid,
		fid: aspect.uuid,
		title: aspect.title,
		mimetype: "application/json",
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

		mimetype: "application/javascript",
		size: 0,
		parent: Node.ACTIONS_FOLDER_UUID,

		createdTime: nowIso(),
		modifiedTime: nowIso(),
	});
}

function nowIso() {
	return new Date().toISOString();
}
