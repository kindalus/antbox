import { describe, it } from "bdd";
import { expect } from "expect";
import { ArticleNode } from "./article_node.ts";
import { Nodes } from "../nodes/nodes.ts";

const validMetadata = {
	uuid: "article-uuid",
	title: "Article title",
	parent: Nodes.ROOT_FOLDER_UUID,
	owner: "editor@example.com",
	articleAuthor: "editor@example.com",
	articleProperties: {
		pt: {
			articleTitle: "Article title",
			articleFid: "article-title",
			articleResume: "Summary",
			articleBody: "Body",
		},
	},
};

describe("ArticleNode", () => {
	it("rejects an article without localized properties", () => {
		const result = ArticleNode.create({
			...validMetadata,
			articleProperties: {},
		});

		expect(result.isLeft()).toBeTruthy();
		expect(result.value.message).toContain("ArticleNode.articleProperties is required");
	});

	it("is recognized as an article that has aspects", () => {
		const result = ArticleNode.create({
			...validMetadata,
			aspects: ["announcement"],
		});

		expect(result.isRight(), result.value.message).toBeTruthy();
		expect(Nodes.isArticle(result.right)).toBeTruthy();
		expect(Nodes.hasAspects(result.right)).toBeTruthy();
	});
});
