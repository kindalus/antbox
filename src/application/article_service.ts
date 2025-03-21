import { BadRequestError, UnknownError, type AntboxError } from "shared/antbox_error.ts";
import { left, right, type Either } from "shared/either.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { NodeService } from "./node_service.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { ArticleServiceContext } from "./article_service_context.ts";
import { parse } from "marked";
import { ArticleNotFound } from "domain/articles/article_not_found_error.ts";
import { JSDOM } from 'jsdom';
import { articleToNode, nodeToArticle, type ArticleDTO } from "./article_dto.ts";

export class ArticleService {

  constructor(
    private readonly context: ArticleServiceContext,
    private readonly nodeService: NodeService
  ) {}

  async createOrReplace(
    ctx: AuthenticationContext, 
    file: File,
    metadata: ArticleDTO
  ): Promise<Either<AntboxError, ArticleDTO>> {
    if(file.type !== Nodes.ARTICLE_MIMETYPE) {
      return left(new BadRequestError(`Invalid file mimetype: : ${file.type}`))
    }

    if (!metadata.uuid) {
      return left(new BadRequestError("Article UUID is required"));
    }

    const articleOrErr = await this.get(ctx, metadata.uuid);
    if(articleOrErr.isLeft()) {
      return await this.#create(ctx, file, metadata);
    }

    return this.#update(ctx, file, metadata);
  }

  async get(
    ctx: AuthenticationContext,
    uuid: string
  ): Promise<Either<AntboxError, ArticleDTO>> {
    const nodeOrErr = await this.nodeService.get(ctx, uuid);
    if(nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const node = nodeOrErr.value as ArticleNode;

    const fileTextOrErr = await this.#getFileText(ctx, uuid);
    if(fileTextOrErr.isLeft()) {
      return left(fileTextOrErr.value);
    }

    const fileText = fileTextOrErr.value;

    if(Nodes.isMarkdown(node)) {
      const html = await this.#markdownToHtml(fileText);
      return right(nodeToArticle(node, html));
    }

    if(Nodes.isHtml(node)) {
      return right(nodeToArticle(node, fileText));
    }

    if(Nodes.isTextPlain(node)) {
      const html = this.#textPlainToHtml(fileText);
      return right(nodeToArticle(node, html));
    }

    if(!Nodes.isArticle(node)) {
      return left(new ArticleNotFound(uuid));
    }

    return right(nodeToArticle(node, fileText));
  }

  async getByLang(
    ctx: AuthenticationContext, 
    uuid: string,
    lang: "pt" | "en" | "fr" | "es",
  ): Promise<Either<AntboxError, ArticleDTO>> {
    const articleOrErr = await this.get(ctx, uuid);
    if(articleOrErr.isLeft()) {
      return left(articleOrErr.value)
    }

    if (!["pt", "en", "es", "fr"].includes(lang)) {
      return left(new ArticleNotFound(uuid));
    }

    const article = articleOrErr.value;
    const html = article.content;

    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      if(!document) {
        console.error("Error parsing file text to DOM");
        return right(article);
      }

      const contentElement =
        document.querySelector(`template[lang='${lang}']`)?.innerHTML ??
        document.querySelector("template:not([lang])")?.innerHTML ??
        document.querySelector("body")?.innerHTML;

      const newArticle = articleToNode(ctx, article);

      return right(nodeToArticle(newArticle, contentElement));
    } catch (e) {
      console.error("Error parsing file text to DOM: ", e);
      return left(new UnknownError("Error parsing file text to DOM"));
    }
  }

  async delete(
    ctx: AuthenticationContext, 
    uuid: string
  ): Promise<Either<AntboxError, void>> {
    const nodeOrErr = await this.get(ctx, uuid);

    if(nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return this.nodeService.delete(ctx, uuid);
  }

  async export(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, File>> {
    const articleOrErr = await this.get(ctx, uuid);
    if (articleOrErr.isLeft()) {
      return left(articleOrErr.value);
    }

    const file = new File(
      [JSON.stringify(articleOrErr.value, null, 2)],
      `${articleOrErr.value?.uuid}.json`,
      {
        type: "application/json",
      },
    );

    return right(file);
  }

  async list(ctx: AuthenticationContext): Promise<ArticleDTO[]> {
    const nodesOrErrs = await this.nodeService.find(
      ctx,
      [
        ["mimetype", "==", Nodes.ARTICLE_MIMETYPE],
      ],
      Number.MAX_SAFE_INTEGER,
    );

    if (nodesOrErrs.isLeft()) {
      console.error(nodesOrErrs.value);
      return [];
    }

    const articles = nodesOrErrs.value.nodes.map((n) => nodeToArticle(n));
    return articles;
  }

  async #create(
    ctx: AuthenticationContext, 
    file: File, 
    metadata: ArticleDTO,
  ): Promise<Either<AntboxError, ArticleDTO>> {
    const nodeOrErr = await this.nodeService.createFile(ctx, file, metadata);

    if(nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return right(nodeToArticle(nodeOrErr.value as ArticleNode));
  }

  async #markdownToHtml(value: string): Promise<string> {
    try {
      const html = await parse(value);
      return html;
    } catch(error) {
      console.error(`Error in parsing markdown to html: ${JSON.stringify(error)}`);
      return "";
    }
  }

  #textPlainToHtml(value: string):  string {
    try {
      const paragraphs = value
        .split(/\r?\n\s*/)
        .filter(p => p.length > 0);

      const htmlParagraphs = paragraphs
        .map((p) => `<p>${this.#escapeSpecialCharacterHtml(p)}</p>`)
        .join("");

      return htmlParagraphs;
    }catch(error) {
      console.error(new UnknownError(`Error in parsing text plain to html: ${JSON.stringify(error)}`));
      return "";
    }
  }

  #escapeSpecialCharacterHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async #getFileText(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, string>> {
    const fileOrErr = await this.nodeService.export(ctx, uuid);
    if(fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    const fileText = await fileOrErr.value.text();

    return right(fileText);
  }

  async #update(
    ctx: AuthenticationContext, 
    file: File, 
    meatadata: ArticleDTO,
  ): Promise<Either<AntboxError, ArticleDTO>> {
    const nodeOrErr = await this.get(ctx, meatadata.uuid);
    if(nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    const createOrErr = ArticleNode.create({
      ...meatadata,
      owner: ctx.principal.email,
      size: file.size,
    });

    if(createOrErr.isLeft()) {
      return left(createOrErr.value);
    }

    const article = createOrErr.value;

    return await this.#updateFile(ctx, file, article);
  }

  async #updateFile(
    ctx: AuthenticationContext, 
    file: File, 
    metadata: ArticleNode,
  ): Promise<Either<AntboxError, ArticleDTO>> {
    const updateFileOrErr = await this.context.storage.write(metadata.uuid, file, {
      title: metadata.title,
      mimetype: metadata.mimetype,
      parent: metadata.parent,
    })

    if(updateFileOrErr.isLeft()) {
      return left(updateFileOrErr.value);
    }

    const voidOrErr = await this.context.repository.add(metadata);
    if(voidOrErr.isLeft()) {
      return left(voidOrErr.value);
    }

    const nodeOrErr = await this.get(ctx ,metadata.uuid);
    if(nodeOrErr.isLeft()) {
      return left(nodeOrErr.value);
    }

    return right(nodeOrErr.value);
  }
}
