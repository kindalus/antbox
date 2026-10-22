import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeService } from "application/nodes/node_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { ArticlePropertiesMap } from "domain/articles/article_properties.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import { ValidationError } from "shared/validation_error.ts";
import { ArticleService } from "./article_service.ts";

const root: AuthenticationContext = {
	mode: "Direct",
	tenant: "test",
	principal: { email: Users.ROOT_USER_EMAIL, groups: [Groups.ADMINS_GROUP_UUID] },
};
const article = {
	uuid: "article",
	title: "Article",
	parent: "articles",
	owner: root.principal.email,
	articleAuthor: root.principal.email,
	articleProperties: {
		en: {
			articleTitle: "English",
			articleFid: "english",
			articleResume: "Summary",
			articleBody: "Body",
		},
	},
};

async function setup() {
	const repository = new CountingRepository();
	const nodes = new NodeService({
		repository,
		storage: new InMemoryStorageProvider(),
		configRepo: new InMemoryConfigurationRepository(),
		bus: { publish() {}, subscribe() {}, unsubscribe() {} },
	});
	await nodes.create(root, {
		uuid: "articles",
		title: "Articles",
		parent: Nodes.ROOT_FOLDER_UUID,
		mimetype: Nodes.FOLDER_MIMETYPE,
		permissions: { group: [], authenticated: [], anonymous: [], advanced: {} },
	});
	const service = new ArticleService(nodes);
	expect((await service.createOrReplace(root, article)).isRight()).toBe(true);
	return { service, repository };
}

class CountingRepository extends InMemoryNodeRepository {
	articleReads = 0;
	filteredNodes = 0;
	filterPageSizes: number[] = [];
	override getById(uuid: string) {
		if (uuid === "article") this.articleReads++;
		return super.getById(uuid);
	}
	override async filter(filters: NodeFilters, pageSize = 20, pageToken = 1) {
		const result = await super.filter(filters, pageSize, pageToken);
		this.filteredNodes += result.nodes.length;
		this.filterPageSizes.push(pageSize);
		return result;
	}
}

describe("ArticleService integrity", () => {
	it("preserves a denied read instead of trying to create the article", async () => {
		const { service } = await setup();
		const result = await service.createOrReplace({
			...root,
			principal: { email: "other@example.com", groups: ["other"] },
		}, { uuid: "article" });
		expect(result.value).toBeInstanceOf(ForbiddenError);
	});

	it("localizes from one authorized article read", async () => {
		const { service, repository } = await setup();
		repository.articleReads = 0;
		const result = await service.getLocalized(root, "article", "en");
		expect(result.right.articleTitle).toBe("English");
		expect(repository.articleReads).toBe(1);
	});

	it("retrieves only the matching article for a localized friendly identifier", async () => {
		const { service, repository } = await setup();
		for (let index = 1; index < 40; index++) {
			const result = await service.createOrReplace(root, {
				...article,
				uuid: `article-${index}`,
				articleProperties: {
					en: { ...article.articleProperties.en, articleFid: `english-${index}` },
				},
			});
			expect(result.isRight()).toBe(true);
		}
		repository.filteredNodes = 0;
		repository.filterPageSizes = [];
		const result = await service.getLocalizedByFid(root, "english-39", "en");
		expect(result.right.uuid).toBe("article-39");
		expect(repository.filteredNodes).toBe(1);
		expect(repository.filterPageSizes).toEqual([1]);

		const denied = await service.getLocalizedByFid(
			{
				...root,
				principal: { email: "other@example.com", groups: ["other"] },
			},
			"english-39",
			"en",
		);
		expect(denied.isLeft()).toBe(true);
	});

	it("preserves localized friendly identifier lookups for dotted locale keys", async () => {
		const { service } = await setup();
		expect((await service.createOrReplace(root, {
			...article,
			articleProperties: {
				"pt.BR": { ...article.articleProperties.en, articleFid: "portuguese" },
			},
		})).isRight()).toBe(true);
		const result = await service.getLocalizedByFid(root, "portuguese", "pt.BR");
		expect(result.right.uuid).toBe("article");
		expect(result.right.articleFid).toBe("portuguese");
	});

	it("uses the language fallback for prototype property names", async () => {
		const { service } = await setup();
		for (const locale of ["toString", "constructor", "__proto__"]) {
			const result = await service.getLocalized(root, "article", locale);
			expect(result.right.articleTitle).toBe("English");
		}
	});

	it("rejects malformed locale records through the domain and service without throwing", async () => {
		const { service } = await setup();
		for (const properties of [{ en: null }, { en: 4 }, { en: { articleTitle: 5 } }]) {
			const articleProperties = properties as unknown as ArticlePropertiesMap;
			const created = ArticleNode.create({ ...article, articleProperties });
			expect(created.value).toBeInstanceOf(ValidationError);
			for (const uuid of ["article", "new-article"]) {
				const result = await service.createOrReplace(root, {
					...article,
					uuid,
					title: undefined,
					articleProperties,
				});
				expect(result.value).toBeInstanceOf(ValidationError);
			}
		}
	});
});
