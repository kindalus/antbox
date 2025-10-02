import { AspectNode } from "domain/aspects/aspect_node.ts";

export const ARTICLE_ASPECT = AspectNode.create({
	uuid: "--article--",
	title: "Article",
	filters: [["mimetype", "in", ["text/html", "text/markdown", "text/plain"]]],
}).right;

export const builtinAspects: AspectNode[] = [
	ARTICLE_ASPECT,
];
