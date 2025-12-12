import { AspectNode } from "domain/aspects/aspect_node.ts";
import { Users } from "domain/users_groups/users.ts";

export const ARTICLE_ASPECT: AspectNode = AspectNode.create({
	uuid: "--article--",
	title: "Article",
	owner: Users.ROOT_USER_EMAIL,
	filters: [["mimetype", "in", ["text/html", "text/markdown", "text/plain"]]],
}).right;

export const WORKFLOW_INSTANCE_ASPECT: AspectNode = AspectNode.create({
	uuid: "--workflow-instance--",
	title: "Workflow Instance",
	owner: Users.ROOT_USER_EMAIL,
	properties: [
		{
			name: "workflowInstanceUuid",
			title: "Workflow Instance UUID",
			type: "string",
			required: true,
		},
	],
}).right;

export const builtinAspects: AspectNode[] = [
	ARTICLE_ASPECT,
	WORKFLOW_INSTANCE_ASPECT,
];
