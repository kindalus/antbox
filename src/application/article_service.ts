import { type AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AuthenticationContext } from "application/authentication_context.ts";
import type { NodeService } from "application/node_service.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { ArticleServiceContext } from "application/article_service_context.ts";
import { parse } from "marked";
import { JSDOM } from "jsdom";

import { ARTICLE_ASPECT } from "./builtin_aspects/index.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";

/**
 * ArticleService manages documents with mimetypes "text/html", "text/plain", or "text/markdown"
 * that have the builtin aspect --article--.
 *
 * Key features:
 * - get() method returns HTML string (text/html), converting from source format if needed
 * - Automatically converts markdown and text/plain to HTML
 * - Supports multilingual content via HTML templates with lang attributes
 * - Optional lang parameter in get() filters content by language template
 */
export class ArticleService {
	constructor(
		private readonly context: ArticleServiceContext,
		private readonly nodeService: NodeService,
	) {}

	async createOrReplace(
		ctx: AuthenticationContext,
		file: File,
		metadata: { uuid: string; title: string; description?: string; parent: string },
	): Promise<Either<AntboxError, FileNode>> {
		if (!["text/html", "text/plain", "text/markdown"].includes(file.type)) {
			return left(new BadRequestError(`Invalid file mimetype: : ${file.type}`));
		}

		if (!metadata.uuid) {
			return left(new BadRequestError("Article UUID is required"));
		}

		const nodeOrErr = await this.nodeService.get(ctx, metadata.uuid);
		if (nodeOrErr.isLeft()) {
			// Create new article
			const aspects = [ARTICLE_ASPECT.uuid];
			const createOrErr = await this.nodeService.createFile(ctx, file, { ...metadata, aspects });

			if (createOrErr.isLeft()) {
				return left(createOrErr.value);
			}

			return right(createOrErr.value as FileNode);
		}

		return this.#update(ctx, file, metadata);
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
		lang?: "pt" | "en" | "fr" | "es",
	): Promise<Either<AntboxError, string>> {
		if (lang) {
			return this.#getByLang(ctx, uuid, lang);
		}

		const nodeOrErr = await this.nodeService.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value as FileNode;

		const fileTextOrErr = await this.#getFileText(ctx, uuid);
		if (fileTextOrErr.isLeft()) {
			return left(fileTextOrErr.value);
		}

		const fileText = fileTextOrErr.value;

		if (Nodes.isMarkdown(node)) {
			const html = await this.#markdownToHtml(fileText);
			return right(html);
		}

		if (Nodes.isHtml(node)) {
			return right(fileText);
		}

		if (Nodes.isTextPlain(node)) {
			const html = await this.#textPlainToHtml(fileText);
			return right(html);
		}

		if (!Nodes.isArticle(node)) {
			return left(new NodeNotFoundError(uuid));
		}

		return right(fileText);
	}

	async #getByLang(
		ctx: AuthenticationContext,
		uuid: string,
		lang: "pt" | "en" | "fr" | "es",
	): Promise<Either<AntboxError, string>> {
		const htmlOrErr = await this.get(ctx, uuid);
		if (htmlOrErr.isLeft()) {
			return left(htmlOrErr.value);
		}

		if (!["pt", "en", "es", "fr"].includes(lang)) {
			return left(new NodeNotFoundError(uuid));
		}

		const html = htmlOrErr.value;

		try {
			const dom = new JSDOM(html);
			const document = dom.window.document;

			if (!document) {
				console.error("Error parsing file text to DOM");
				return right(html);
			}

			const contentElement = document.querySelector(`template[lang='${lang}']`)?.innerHTML ??
				document.querySelector("template:not([lang])")?.innerHTML ??
				document.querySelector("body")?.innerHTML;

			return right(contentElement ?? html);
		} catch (e) {
			console.error("Error parsing file text to DOM: ", e);
			return left(new UnknownError("Error parsing file text to DOM"));
		}
	}

	async delete(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.nodeService.get(ctx, uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		if (!Nodes.isArticle(node)) {
			return left(new NodeNotFoundError(uuid));
		}

		return this.nodeService.delete(ctx, uuid);
	}

	async list(ctx: AuthenticationContext): Promise<FileNode[]> {
		const nodesOrErrs = await this.nodeService.find(
			ctx,
			[
				["aspects", "contains", ARTICLE_ASPECT.uuid],
			],
			Number.MAX_SAFE_INTEGER,
		);

		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		return nodesOrErrs.value.nodes as FileNode[];
	}

	async #markdownToHtml(value: string): Promise<string> {
		try {
			const html = await parse(value);
			return html;
		} catch (error) {
			console.error(
				`Error in parsing markdown to html: ${JSON.stringify(error)}`,
			);
			return "";
		}
	}

	async #textPlainToHtml(value: string): Promise<string> {
		try {
			const html = await parse(value);
			return html;
		} catch (error) {
			console.error(
				`Error in parsing text plain to html: ${JSON.stringify(error)}`,
			);
			return "";
		}
	}

	async #getFileText(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, string>> {
		const fileOrErr = await this.nodeService.export(ctx, uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		const fileText = await fileOrErr.value.text();

		return right(fileText);
	}

	async #update(
		ctx: AuthenticationContext,
		file: File,
		metadata: { uuid: string; title: string; description?: string; parent: string },
	): Promise<Either<AntboxError, FileNode>> {
		const nodeOrErr = await this.nodeService.get(ctx, metadata.uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const existingNode = nodeOrErr.value as FileNode;

		const createOrErr = FileNode.create({
			...metadata,
			owner: ctx.principal.email,
			size: file.size,
			mimetype: file.type,
			aspects: existingNode.aspects,
		});

		if (createOrErr.isLeft()) {
			return left(createOrErr.value);
		}

		const article = createOrErr.value;

		const updateFileOrErr = await this.context.storage.write(
			article.uuid,
			file,
			{
				title: article.title,
				mimetype: article.mimetype,
				parent: article.parent,
			},
		);

		if (updateFileOrErr.isLeft()) {
			return left(updateFileOrErr.value);
		}

		const voidOrErr = await this.context.repository.add(article);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return right(article);
	}
}
