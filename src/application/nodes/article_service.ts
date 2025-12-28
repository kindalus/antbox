import {
	type LocalizedArticleDTO,
	type RawArticleDTO,
	selectLocalizedProperties,
	toLocalizedArticleDTO,
	toRawArticleDTO,
} from "./article_dto.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { NodeService } from "./node_service.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import { type ArticlePropertiesMap } from "domain/articles/article_properties.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { FidGenerator } from "shared/fid_generator.ts";

export class ArticleService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		ctx: AuthenticationContext,
		metadata: Partial<RawArticleDTO>,
	): Promise<Either<AntboxError, RawArticleDTO>> {
		if (!metadata.uuid) {
			return left(new BadRequestError("Article UUID is required"));
		}

		if (!metadata.properties || Object.keys(metadata.properties).length === 0) {
			return left(new BadRequestError("Article properties are required"));
		}

		if (!metadata.articleAuthor) {
			return left(new BadRequestError("articleAuthor is required"));
		}

		const nodeOrErr = await this.get(ctx, metadata.uuid);
		if (nodeOrErr.isLeft()) {
			return this.#create(ctx, metadata as RawArticleDTO);
		}

		return this.#update(ctx, metadata.uuid, metadata as RawArticleDTO);
	}

	async #create(
		ctx: AuthenticationContext,
		metadata: RawArticleDTO,
	): Promise<Either<AntboxError, RawArticleDTO>> {
		// Generate articleFid for each locale if not provided
		const articleProperties = this.#ensureArticleFids(metadata.properties);

		// Get title from first available locale (pt -> en -> first available)
		const props = selectLocalizedProperties(articleProperties, "pt");
		const title = metadata.title || props.articleTitle;

		const nodeOrErr = ArticleNode.create({
			uuid: metadata.uuid,
			title,
			description: metadata.description,
			parent: metadata.parent,
			owner: ctx.principal.email,
			articleProperties,
			articleAuthor: metadata.articleAuthor,
		});

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const article = nodeOrErr.value;

		const createOrErr = await this.nodeService.create(ctx, article.metadata);
		if (createOrErr.isLeft()) {
			return left(createOrErr.value);
		}

		return right(toRawArticleDTO(article));
	}

	async #update(
		ctx: AuthenticationContext,
		uuid: string,
		metadata: Partial<RawArticleDTO>,
	): Promise<Either<AntboxError, RawArticleDTO>> {
		// Get existing article to merge properties
		const existingOrErr = await this.get(ctx, uuid);
		if (existingOrErr.isLeft()) {
			return left(existingOrErr.value);
		}

		const existing = existingOrErr.value;

		// Merge the properties
		const articleProperties = metadata.properties
			? this.#ensureArticleFids(metadata.properties)
			: existing.properties;
		const articleAuthor = metadata.articleAuthor || existing.articleAuthor;

		const title = metadata.title ||
			selectLocalizedProperties(articleProperties, "pt").articleTitle;

		const updateOrErr = await this.nodeService.update(ctx, uuid, {
			title,
			description: metadata.description,
			parent: metadata.parent,
			articleProperties,
			articleAuthor,
		});

		if (updateOrErr.isLeft()) {
			return left(updateOrErr.value);
		}

		const articleOrErr = await this.get(ctx, uuid);
		if (articleOrErr.isLeft()) {
			return left(articleOrErr.value);
		}

		return right(articleOrErr.value);
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, RawArticleDTO>> {
		const nodeOrErr = await this.nodeService.get(ctx, uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		if (!Nodes.isArticle(node as unknown as NodeLike)) {
			return left(new NodeNotFoundError(uuid));
		}

		const articleOrErr = ArticleNode.create(node);

		if (articleOrErr.isLeft()) {
			return left(articleOrErr.value);
		}

		return right(toRawArticleDTO(articleOrErr.value));
	}

	async getLocalized(
		ctx: AuthenticationContext,
		uuid: string,
		locale: string,
	): Promise<Either<AntboxError, LocalizedArticleDTO>> {
		const articleOrErr = await this.get(ctx, uuid);

		if (articleOrErr.isLeft()) {
			return left(articleOrErr.value);
		}

		const nodeOrErr = await this.nodeService.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const articleNodeOrErr = ArticleNode.create(nodeOrErr.value);

		if (articleNodeOrErr.isLeft()) {
			return left(articleNodeOrErr.value);
		}

		return right(toLocalizedArticleDTO(articleNodeOrErr.value, locale));
	}

	async getLocalizedByFid(
		ctx: AuthenticationContext,
		fid: string,
		locale: string,
	): Promise<Either<AntboxError, LocalizedArticleDTO>> {
		const articlesOrErrs = await this.nodeService.find(
			ctx,
			[
				["mimetype", "==", "application/vnd.antbox.article"],
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (articlesOrErrs.isLeft()) {
			return left(articlesOrErrs.value);
		}

		for (const node of articlesOrErrs.value.nodes) {
			const metadata = node.metadata;
			const articleProperties = metadata.articleProperties as ArticlePropertiesMap;

			if (articleProperties && articleProperties[locale]?.articleFid === fid) {
				const articleNodeOrErr = ArticleNode.create(metadata);

				if (articleNodeOrErr.isLeft()) {
					continue;
				}

				return right(toLocalizedArticleDTO(articleNodeOrErr.value, locale));
			}
		}

		return left(
			new NodeNotFoundError(`Article with fid '${fid}' and locale '${locale}' not found`),
		);
	}

	async list(ctx: AuthenticationContext): Promise<RawArticleDTO[]> {
		const nodesOrErrs = await this.nodeService.find(
			ctx,
			[
				["mimetype", "==", "application/vnd.antbox.article"],
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		return nodesOrErrs.value.nodes
			.map((n) => {
				const articleOrErr = ArticleNode.create(n.metadata);
				return articleOrErr.isRight() ? toRawArticleDTO(articleOrErr.value) : null;
			})
			.filter((a): a is RawArticleDTO => a !== null);
	}

	async delete(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.get(ctx, uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		return this.nodeService.delete(ctx, uuid);
	}

	#ensureArticleFids(properties: ArticlePropertiesMap): ArticlePropertiesMap {
		const result: ArticlePropertiesMap = {};

		for (const [locale, props] of Object.entries(properties)) {
			result[locale] = {
				...props,
				articleFid: props.articleFid || FidGenerator.generate(props.articleTitle),
			};
		}

		return result;
	}
}
