import { ArticleNode } from "domain/articles/article_node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";

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
  };
}

export function articleToNode(
  ctx: AuthenticationContext,
  article: ArticleDTO,
): ArticleNode {
  return ArticleNode.create({
    uuid: article.uuid,
    title: article.title,
    description: article.description,
    size: article.size,
    parent: article.parent,
    owner: ctx.principal.email,
  }).right;
}
