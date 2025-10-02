import { AspectNode } from "domain/aspects/aspect_node.ts";
import { Users } from "domain/users_groups/users.ts";

let _ARTICLE_ASPECT: AspectNode | undefined;

export const ARTICLE_ASPECT = {
	get uuid() {
		if (!_ARTICLE_ASPECT) {
			_ARTICLE_ASPECT = AspectNode.create({
				uuid: "--article--",
				title: "Article",
				owner: Users.ROOT_USER_EMAIL,
				filters: [["mimetype", "in", ["text/html", "text/markdown", "text/plain"]]],
			}).right;
		}
		return _ARTICLE_ASPECT.uuid;
	},
};

export function getBuiltinAspects(): AspectNode[] {
	if (!_ARTICLE_ASPECT) {
		_ARTICLE_ASPECT = AspectNode.create({
			uuid: "--article--",
			title: "Article",
			owner: Users.ROOT_USER_EMAIL,
			filters: [["mimetype", "in", ["text/html", "text/markdown", "text/plain"]]],
		}).right;
	}
	return [_ARTICLE_ASPECT];
}
