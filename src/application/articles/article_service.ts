import { Logger } from "shared/logger.ts";
import {
	type LocalizedArticleDTO,
	type RawArticleDTO,
	selectLocalizedProperties,
	toLocalizedArticleDTO,
	toRawArticleDTO,
} from "./article_dto.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { NodeService } from "../nodes/node_service.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import {
	ARTICLE_BODY_CONTENT_TYPES,
	type ArticleBodyContentType,
	type ArticlePropertiesMap,
} from "domain/articles/article_properties.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { FidGenerator } from "shared/fid_generator.ts";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { marked } from "marked";

export type ArticleRenderFormat = ArticleBodyContentType;

export interface RenderedArticle {
	content: string;
	contentType:
		| "text/html; charset=utf-8"
		| "text/markdown; charset=utf-8"
		| "text/plain; charset=utf-8";
}

const window = new JSDOM("").window;
const purify = DOMPurify(window);

export class ArticleService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		ctx: AuthenticationContext,
		metadata: Partial<RawArticleDTO>,
	): Promise<Either<AntboxError, RawArticleDTO>> {
		if (!metadata.uuid) {
			return left(new BadRequestError("Article UUID is required"));
		}

		const nodeOrErr = await this.get(ctx, metadata.uuid);
		if (nodeOrErr.isRight()) {
			return this.#update(ctx, metadata.uuid, metadata);
		}

		if (!metadata.articleProperties || Object.keys(metadata.articleProperties).length === 0) {
			return left(new BadRequestError("Article properties are required"));
		}

		if (!metadata.articleAuthor) {
			return left(new BadRequestError("articleAuthor is required"));
		}

		return this.#create(ctx, metadata as RawArticleDTO);
	}

	async #create(
		ctx: AuthenticationContext,
		metadata: RawArticleDTO,
	): Promise<Either<AntboxError, RawArticleDTO>> {
		// Generate articleFid for each locale if not provided
		const articleProperties = this.#ensureArticleFids(metadata.articleProperties);

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
			articleBodyContentType: metadata.articleBodyContentType,
			aspects: metadata.aspects,
			properties: metadata.properties,
		});

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const article = nodeOrErr.value;

		const createOrErr = await this.nodeService.create(ctx, article.metadata);
		if (createOrErr.isLeft()) {
			return left(createOrErr.value);
		}

		return this.get(ctx, article.uuid);
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
		const articleProperties = metadata.articleProperties
			? this.#ensureArticleFids(metadata.articleProperties)
			: existing.articleProperties;
		const articleAuthor = metadata.articleAuthor || existing.articleAuthor;
		const articleBodyContentType = metadata.articleBodyContentType ??
			existing.articleBodyContentType;

		const title = metadata.title ||
			selectLocalizedProperties(articleProperties, "pt").articleTitle;

		const updateOrErr = await this.nodeService.update(ctx, uuid, {
			title,
			description: metadata.description,
			parent: metadata.parent,
			articleProperties,
			articleAuthor,
			articleBodyContentType,
			aspects: metadata.aspects,
			properties: metadata.properties,
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

	async render(
		ctx: AuthenticationContext,
		uuid: string,
		locale: string,
		format: string,
	): Promise<Either<AntboxError, RenderedArticle>> {
		const articleOrErr = await this.getLocalized(ctx, uuid, locale);
		if (articleOrErr.isLeft()) {
			return left(articleOrErr.value);
		}

		return renderArticleBody(
			articleOrErr.value.articleBody,
			articleOrErr.value.articleBodyContentType,
			format,
		);
	}

	async renderByFid(
		ctx: AuthenticationContext,
		fid: string,
		locale: string,
		format: string,
	): Promise<Either<AntboxError, RenderedArticle>> {
		const articleOrErr = await this.getLocalizedByFid(ctx, fid, locale);
		if (articleOrErr.isLeft()) {
			return left(articleOrErr.value);
		}

		return renderArticleBody(
			articleOrErr.value.articleBody,
			articleOrErr.value.articleBodyContentType,
			format,
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
			Logger.error(nodesOrErrs.value);
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

function renderArticleBody(
	body: string,
	sourceFormat: ArticleBodyContentType,
	requestedFormat: string,
): Either<BadRequestError, RenderedArticle> {
	if (!ARTICLE_BODY_CONTENT_TYPES.includes(requestedFormat as ArticleRenderFormat)) {
		return left(new BadRequestError(`Unsupported article render format '${requestedFormat}'`));
	}

	const format = requestedFormat as ArticleRenderFormat;
	if (format === "markdown") {
		if (sourceFormat === "html") {
			return left(new BadRequestError("HTML articles cannot be rendered as Markdown"));
		}
		return right({ content: body, contentType: "text/markdown; charset=utf-8" });
	}

	if (format === "text") {
		const content = sourceFormat === "text" ? body : htmlToText(toHtml(body, sourceFormat));
		return right({ content, contentType: "text/plain; charset=utf-8" });
	}

	return right({
		content: sanitizeHtml(toHtml(body, sourceFormat)),
		contentType: "text/html; charset=utf-8",
	});
}

function toHtml(body: string, sourceFormat: ArticleBodyContentType): string {
	if (sourceFormat === "html") {
		return body;
	}
	if (sourceFormat === "markdown") {
		return marked.parse(body, { async: false });
	}
	return `<pre>${escapeHtml(body)}</pre>`;
}

function sanitizeHtml(html: string): string {
	return purify.sanitize(html, { USE_PROFILES: { html: true } });
}

function htmlToText(html: string): string {
	const container = window.document.createElement("div");
	container.innerHTML = sanitizeHtml(html);
	return container.textContent ?? "";
}

function escapeHtml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
