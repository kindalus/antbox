import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "./node_service.ts";
import { ArticleNode } from "domain/articles/article_node.ts";
import type { ArticleServiceContext } from "./article_service_context.ts";

export class ArticleService {

  constructor (private readonly context: ArticleServiceContext) {}

  async create(metadata: Partial<ArticleNode>): Promise<Either<AntboxError, ArticleNode>> {
    const articleNodeOrErr = ArticleNode.create(metadata)
  }

  // async get(uuid: string): Promise<Either<NodeNotFoundError, ArticleNode>> {
  //   const nodeOrErr = await this.context.repository.getById(uuid);
  //   if (nodeOrErr.isLeft()) {
  //     return left(nodeOrErr.value);
  //   }

  //   const node = nodeOrErr.value;
  //   if (!Nodes.isArticle(node)) {
  //     return left(new NodeNotFoundError(uuid));
  //   }


  // }

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
  // }
}
