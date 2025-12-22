import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AuthenticationContext } from "application/authentication_context.ts";
import type { NodeService } from "application/node_service.ts";
import {
	ArticleNode,
	type ArticleProperties,
	type LocaleMap,
} from "domain/articles/article_node.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import {
	type LocalizedArticleDTO,
	type RawArticleDTO,
	selectLocalizedString,
	toLocalizedArticleDTO,
	toRawArticleDTO,
} from "application/article_dto.ts";
import type { NodeLike } from "domain/node_like.ts";
import { Nodes } from "domain/nodes/nodes.ts";
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

		if (!metadata.articleTitle || !metadata.articleResume || !metadata.articleBody) {
			return left(
				new BadRequestError("articleTitle, articleResume, and articleBody are required"),
			);
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
		const articleFid = metadata.articleFid || this.#generateArticleFid(metadata.articleTitle);

		const properties: ArticleProperties = {
			articleTitle: metadata.articleTitle,
			articleFid,
			articleResume: metadata.articleResume,
			articleBody: metadata.articleBody,
			articleAuthor: metadata.articleAuthor,
		};

		const title = metadata.title || selectLocalizedString(metadata.articleTitle, "pt");

		const nodeOrErr = ArticleNode.create({
			uuid: metadata.uuid,
			title,
			description: metadata.description,
			parent: metadata.parent,
			owner: ctx.principal.email,
			properties,
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
		const properties: Partial<ArticleProperties> = {};

		if (metadata.articleTitle) {
			properties.articleTitle = metadata.articleTitle;
			if (!metadata.articleFid) {
				properties.articleFid = this.#generateArticleFid(metadata.articleTitle);
			}
		}

		if (metadata.articleFid) {
			properties.articleFid = metadata.articleFid;
		}

		if (metadata.articleResume) {
			properties.articleResume = metadata.articleResume;
		}
		if (metadata.articleBody) {
			properties.articleBody = metadata.articleBody;
		}
		if (metadata.articleAuthor) {
			properties.articleAuthor = metadata.articleAuthor;
		}

		const title = metadata.title ||
			(metadata.articleTitle ? selectLocalizedString(metadata.articleTitle, "pt") : undefined);

		const updateOrErr = await this.nodeService.update(ctx, uuid, {
			title,
			description: metadata.description,
			parent: metadata.parent,
			properties,
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

		const articleOrErr = ArticleNode.create({
			...node,
			properties: node.properties as ArticleProperties,
		});

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

		const articleNodeOrErr = ArticleNode.create({
			...nodeOrErr.value,
			properties: nodeOrErr.value.properties as ArticleProperties,
		});

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
			const props = node.metadata.properties as ArticleProperties;
			if (props.articleFid && props.articleFid[locale] === fid) {
				const articleNodeOrErr = ArticleNode.create({
					...node.metadata,
					properties: props,
				});

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
				const articleOrErr = ArticleNode.create({
					...n.metadata,
					properties: n.metadata.properties as ArticleProperties,
				});
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

	#generateArticleFid(articleTitle: LocaleMap): LocaleMap {
		const articleFid: LocaleMap = {};
		for (const [locale, title] of Object.entries(articleTitle)) {
			articleFid[locale] = FidGenerator.generate(title);
		}
		return articleFid;
	}
}
