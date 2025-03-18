import { ArticleNode } from "domain/articles/article_node.ts";
import type { ArticleServiceContext } from "./article_service_context.ts";
import { left, right, type Either } from "shared/either.ts";
import { ForbiddenError, type AntboxError } from "shared/antbox_error.ts";
import { ArticleExistsError } from "domain/articles/article_exists_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { ArticleNotFound } from "domain/articles/article_not_found_error.ts";
import { InvalidArticleMimetypeError } from "domain/articles/invalid_article_mimetype_error.ts";

export class ArticleService {

  constructor(private readonly context: ArticleServiceContext) {}

  async create(file: File, metadata: Partial<ArticleNode>): Promise<Either<AntboxError, ArticleNode>> {
    if (!(Nodes.isHtml(file) || Nodes.isMarkdown(file) || Nodes.isTxt(file))) {
      return left(new InvalidArticleMimetypeError(file.type));
    }

    const existingOrErr = await this.get(metadata.uuid!);
    if(existingOrErr.isRight()) {
      return left(new ArticleExistsError(metadata.uuid!));
    }

    const createOrErr = ArticleNode.create({
      uuid: metadata.uuid,
      fid: metadata.fid,
      title: metadata.title,
      parent: metadata.parent,
      owner: metadata.owner,
      description: metadata.description,
      size: file.size,
    });
    if(createOrErr.isLeft()) {
      return left(createOrErr.value);
    }

    const article = createOrErr.value;

    const f = new File([file], file.name, { type: file.type });

    const articleOrErr = await this.context.repository.add(article);
    if(articleOrErr.isLeft()) {
      return left(articleOrErr.value);  
    };

    const writeOrErr = await this.context.storage.write(article.uuid, f, 
      { 
        mimetype: f.type, 
        parent:  article.parent,
        title: article.title,
      },
    );
    if(writeOrErr.isLeft()) {
      return left(writeOrErr.value);
    }

    return right(article);
  }

  async get(uuid: string): Promise<Either<NodeNotFoundError, string>> {
    const existingOrErr = await this.#getFromRepository(uuid);
    if(existingOrErr.isLeft()) {
      return left(existingOrErr.value);
    }

    const node = existingOrErr.value;
    
    if(!Nodes.isArticle(node)) {
      return left(new ArticleNotFound(uuid));
    }

    const fileOrErr = await this.#getFromStorage(node.uuid);
    if(fileOrErr.isLeft()) {
      return left(new ArticleNotFound(uuid));
    }

    const file =  fileOrErr.value;

    if(Nodes.isTxt(file)) {   
      return right(await this.#textToParagraphs(file));
    }

    if (Nodes.isMarkdown(file)) {
      return right(await this.#markdownToParagraphs(file));
    }

    return right(await this.#htmlToParagraphs(file));
  }

  async #textToParagraphs(file: File): Promise<string> {
    const content = await file.text();

    const paragraphs = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => `<p>${line}</p>`)
      .join("");
  
    return paragraphs;
  }

  async #htmlToParagraphs(file: File): Promise<string>{
    const content =  await file.text();

    let textOnly = content
      .replace(/<\/?[a-z][\s\S]*?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/gi, "")
      .trim();

    const paragraphs = textOnly
      .split("\n")
      .map((line) => line.trim())
      .filter(line => line !== "")
      .map(line => `<p>${line}</p>`)
      .join("");

    return paragraphs
  }

  async #markdownToParagraphs(file: File): Promise<string> {
    const content = await file.text();

    let textOnly = content
      .replace(/^#+\s*/gm, "")
      .replace(/^\*\s*/gm, "")
      .replace(/^- /gm, "")         
      .replace(/^\d+\.\s*/gm, "")   
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1") 
      .replace(/```[\s\S]*?```/g, "")
      .trim();

    const paragraphs = textOnly
      .split(/\n+/)
      .map(line => line.trim())
      .filter(line => line !== "")
      .map(line => `<p>${line}</p>`)
      .join("");

    return paragraphs;
  }

  async #getFromRepository(uuid: string): Promise<Either<AntboxError, ArticleNode>> {
    if (Nodes.isFid(uuid)) {
      return await this.context.repository.getByFid(Nodes.uuidToFid(uuid));
    }

    return this.context.repository.getById(uuid);
  }

  async #getFromStorage(uuid: string): Promise<Either<AntboxError, File>> {
    if (Nodes.isFid(uuid)) {
      return await this.context.storage.read(Nodes.uuidToFid(uuid));
    }

    return this.context.storage.read(uuid);
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
