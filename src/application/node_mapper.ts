import { Group } from "../domain/auth/group.ts";
import { FormSpecification } from "../domain/forms_specifications/form_specification.ts";
import { GroupNode } from "../domain/nodes/group_node.ts";
import { UserNode } from "../domain/nodes/user_node.ts";

export function fileToFormSpecification(file: File): Promise<FormSpecification> {
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

export function groupToNode(group: Group): GroupNode {
	const node = Object.assign(new GroupNode(), {
		uuid: group.uuid,
		fid: group.uuid,
		title: group.title,
	});

	if (group.builtIn) {
		node.owner = UserNode.ROOT_USER_EMAIL;
	}

	return node;
}

export function nodeToGroup(node: GroupNode): Group {
	return Object.assign(new Group(), {
		uuid: node.uuid,
		fid: node.uuid,
		title: node.title,
		description: node.description,
		builtIn: node.owner === UserNode.ROOT_USER_EMAIL,
	});
}
