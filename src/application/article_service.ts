import { BadRequestError, UnknownError, type AntboxError } from "shared/antbox_error.ts";
import { left, right, type Either } from "shared/either.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { NodeService } from "./node_service.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { ArticleServiceContext } from "./article_service_context.ts";
import { parse } from "marked";
import { ArticleNotFound } from "domain/articles/article_not_found_error.ts";
export interface ArticleDTO {
  uuid: string;
  title: string;
  description?: string;
  size?: number;
  parent: string;
  content?: string;
}

export function nodeToArticle(
  article: ArticleNode, 
  content?: string,
): ArticleDTO {
  return {
    uuid: article.uuid,
    title: article.title,
    description: article.description,
    size: article.size as number,
    parent: article.parent,
    content: content,
  }
}

export function articleToNode(article: ArticleDTO): ArticleNode {
  return ArticleNode.create({
    uuid: article.uuid,
    title: article.title,
    description: article.description,
    size: article.size,
    parent: article.parent,
  }).right;
}
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

    const contentTextOrErr = await this.#getArticleContentText(ctx, uuid);
    if(contentTextOrErr.isLeft()) {
      return left(contentTextOrErr.value);
    }

    const contentText = contentTextOrErr.value;

    if(Nodes.isMarkdown(node)) {
      const html = await this.#markdownToHtml(contentText);
      return right(nodeToArticle(node, html));
    }

    if(Nodes.isHtml(node)) {
      return right(nodeToArticle(node, contentText));
    }

    if(Nodes.isTextPlain(node)) {
      const html = this.#textPlainToHtml(contentText);
      return right(nodeToArticle(node, html));
    }

    if(!Nodes.isArticle(node)) {
      return left(new ArticleNotFound(uuid));
    }

    return right(nodeToArticle(node, contentText));
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
        .map((p) => `<p>${this.#escapeHtml(p)}</p>`)
        .join("");

      return htmlParagraphs;
    }catch(error) {
      console.error(new UnknownError(`Error in parsing text plain to html: ${JSON.stringify(error)}`));
      return "";
    }
  }

  #escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async #getArticleContentText(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, string>> {
    const fileOrErr = await this.nodeService.export(ctx, uuid);
    if(fileOrErr.isLeft()) {
      return left(fileOrErr.value);
    }

    const contentText = await fileOrErr.value.text();

    return right(contentText);
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


  // async getByLanguage(
  //   ctx: AuthenticationContext,
  //   uuid: string,
  //   lang: "pt" | "en" | "fr" | "es",
  // ): Promise<Either<NodeNotFoundError, string>> {
  //   const articleOrErr = await this.get(ctx, uuid);
  //   if (articleOrErr.isLeft()) {
  //     return left(articleOrErr.value);
  //   }

  //   const node = articleOrErr.value;

  //   if (!node[lang] && !["pt", "en", "es", "fr"].includes(lang)) {
  //     return left(new NodeNotFoundError(uuid));
  //   }

  //   return right(node[lang] ?? node.pt);
  // }

  // async #getArticleNodeText(
  //   ctx: AuthenticationContext,
  //   uuid: string,
  // ): Promise<Either<NodeNotFoundError, Partial<ArticleNode>>> {
  //   const fileOrError = await this.#nodeService.export(ctx, uuid);
  //   if (fileOrError.isLeft()) {
  //     return left(fileOrError.value);
  //   }

  //   const html = await fileOrError.value.text();

  //   return this.#parseHtml(html);
  // }

  // #parseHtml(html: string): Either<UnknownError, Partial<ArticleNode>> {
  //   try {
  //     const document = new DOMParser().parseFromString(html, "text/html");

  //     if (!document) {
  //       return right({});
  //     }

  //     const pt =
  //       document.querySelector("template[lang='pt']")?.innerHTML ??
  //       document.querySelector("template:not([lang])")?.innerHTML ??
  //       "";

  //     const en = document.querySelector("template[lang='en']")?.innerHTML;
  //     const es = document.querySelector("template[lang='es']")?.innerHTML;
  //     const fr = document.querySelector("template[lang='fr']")?.innerHTML;

  //     return right({
  //       pt,
  //       en,
  //       es,
  //       fr,
  //     });
  //   } catch (e) {
  //     console.error("Error parsing web content", e);
  //     return left(new UnknownError("Error parsing web content"));
  //   }

}
