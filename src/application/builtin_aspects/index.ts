import { AspectNode } from "domain/aspects/aspect_node.ts";
import { Users } from "domain/users_groups/users.ts";

export const ARTICLE_ASPECT: AspectNode = AspectNode.create({
	uuid: "--article--",
	title: "Article",
	owner: Users.ROOT_USER_EMAIL,
	filters: [["mimetype", "in", ["text/html", "text/markdown", "text/plain"]]],
}).right;

export const builtinAspects: AspectNode[] = [ARTICLE_ASPECT];
