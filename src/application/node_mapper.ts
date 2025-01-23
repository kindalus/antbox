import { Group } from "../domain/auth/group.ts";
import { GroupNode } from "../domain/auth/group_node.ts";
import { Users } from "../domain/auth/users.ts";
import { FormSpecificationNode } from "../domain/forms_specifications/form_specification.ts";

export function fileToFormSpecification(file: File): Promise<FormSpecificationNode> {
	return file
		.text()
		.then((text) => JSON.parse(text))
		.then((raw) =>
			FormSpecificationNode.create({
				uuid: raw.uuid ?? file.name.split(".")[0],
				title: raw.title ?? file.name.split(".")[0],
				description: raw.description ?? "",
				width: raw.width ?? 595,
				height: raw.height ?? 842,
				targetAspect: raw.targetAspect,
				properties: raw.properties ?? [],
			}).value as FormSpecificationNode
		);
}

export function groupToNode(group: Group): GroupNode {
	const node = Object.assign(new GroupNode(), {
		uuid: group.uuid,
		fid: group.uuid,
		title: group.title,
	});

	if (group.builtIn) {
		node.owner = Users.ROOT_USER_EMAIL;
	}

	return node;
}

export function nodeToGroup(node: GroupNode): Group {
	return Object.assign(new Group(), {
		uuid: node.uuid,
		fid: node.uuid,
		title: node.title,
		description: node.description,
		builtIn: node.owner === Users.ROOT_USER_EMAIL,
	});
}
