import { describe, test, expect } from "bun:test";
import type { ArticleServiceContext } from "./article_service_context";
import { ArticleService } from "./article_service";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import { Nodes } from "domain/nodes/nodes";
import { ArticleExistsError } from "domain/articles/article_exists_error";
import { InvalidArticleMimetypeError } from "domain/articles/invalid_article_mimetype_error";
import { ArticleNotFound } from "domain/articles/article_not_found_error";
import { GroupNode } from "domain/auth/group_node";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";

describe("ArticleService.create", () => {
    test("should create the article and persit metadata", async () => {
        const service =  articleService();

        const file = new File(["there is something here"], "filename.txt",
            { type: "text/plain" }
        );

        const articleOrErr = await service.create(file, {
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });

        expect(articleOrErr.isRight(), errToMsg(articleOrErr.value)).toBeTruthy();
        const article = articleOrErr.right;
        expect(article.title).toBe("File");
        expect(article.size).toBe(file.size);
        expect(article.parent).toBe("--parent--");
        expect(article.mimetype).toBe(Nodes.ARTICLE_MIMETYPE);
    });

    test("should return error if article already exists", async () => {
        const service =  articleService();
        
        const file = new File(["there is something here"], "filename.txt",
            { type: "text/plain" }
        );

        await service.create(file, {
            uuid: "--uuid--",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });

        const articleOrErr = await service.create(file, {
            uuid: "--uuid--",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });

        expect(articleOrErr.isLeft(), errToMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.value).toBeInstanceOf(ArticleExistsError);
    });

    test("should return error if file mimetype is invalid", async () => {
        const service =  articleService();

        const file = new File(["there is something here"], "filename", {
            type: "image/jpg"
        });

        const articleOrErr = await service.create(file, {
            uuid: "--id--",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });

        expect(articleOrErr.isLeft(), errToMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.value).toBeInstanceOf(InvalidArticleMimetypeError);
    });
});

describe("ArticleService.get", () => {
    test("should return the article from storage", async () => {
        const service = articleService();

        const file = new File(["<p>there is something here</p>"], "filename", {
            type: "text/html"
        });

        const createOrErr = await service.create(file, {
            uuid: "--the-uuid--",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });
        expect(createOrErr.isRight(), errToMsg(createOrErr.value)).toBeTruthy();

        const articleOrErr = await service.get(createOrErr.right.uuid);

        expect(articleOrErr.right.length).toBeTruthy();
        expect(articleOrErr.right.startsWith("<p>")).toBeTruthy();
    });

    test("should return an article of html file", async () => {
        const service = articleService();

        const file = new File([`
            <!DOCTYPE html>
            <html>
                <head>
                <title>Page Title</title>
                </head>
            <body>
            
                <h1>This is a Heading</h1>
                <p>This is a paragraph.</p>
                
            </body>
            </html>
        `], "filename.html", { type: "text/html" });

        const createOrErr = await service.create(file, {
            uuid: "--the-uuid--",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });
        expect(createOrErr.isRight(), errToMsg(createOrErr.value)).toBeTruthy();

        const articleOrErr = await service.get(createOrErr.right.uuid);

        expect(articleOrErr.right.length).toBeTruthy();
        expect(articleOrErr.right.startsWith("<p>")).toBeTruthy();
    });

    test("should return an article of markdown file", async () => {
        const service = articleService();

        const file = new File([`
            # Page Title

            ## This is a Heading
            
            This is a paragraph.
        `], "filename.md", { type: "text/markdown" });

        const createOrErr = await service.create(file, {
            uuid: "--this-uuid--",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });
        expect(createOrErr.isRight(), errToMsg(createOrErr.value)).toBeTruthy();

        const articleOrErr = await service.get(createOrErr.right.uuid);

        expect(articleOrErr.right.length).toBeTruthy();
        expect(articleOrErr.right.startsWith("<p>")).toBeTruthy();
    });

    test("should return an article of text file", async () => {
        const service = articleService();

        const file = new File([`
            Page Title

            This is a Heading
            
            This is a paragraph.
        `], "filename.txt", { type: "text/plain" });

        const createOrErr = await service.create(file, {
            uuid: "--nice-uuid--",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });
        expect(createOrErr.isRight(), errToMsg(createOrErr.value)).toBeTruthy();

        const articleOrErr = await service.get(createOrErr.right.uuid);

        expect(articleOrErr.right.length).toBeTruthy();
        expect(articleOrErr.right.startsWith("<p>")).toBeTruthy();
    });

    test("should return error if article not found", async () => {
        const service = articleService();

        const articleOrErr = await service.get("--any-article-uuid--");

        expect(articleOrErr.isLeft(), errToMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.value).toBeInstanceOf(NodeNotFoundError);
    });

    test("should return error if node is not an article node", async () => {
        const service = articleService();

        const articleOrErr = await service.get("--group-uuid--");

        expect(articleOrErr.isLeft(), errToMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.value).toBeInstanceOf(ArticleNotFound);
    });

    test("should return article if id is in fid format", async () => {
        const service = articleService();

        const file = new File([`
            Page Title

            This is a Heading
            
            This is a paragraph.
        `], "filename.txt", { type: "text/plain" });

        const createOrErr = await service.create(file, {
            fid: "friend-id",
            title: "File",
            description: "The description file",
            owner: "user@gmail.com",
            parent: "--parent--",
        });

        expect(createOrErr.isRight(), errToMsg(createOrErr.value)).toBeTruthy();

        const articleOrErr = await service.get("--fid--friend-id");

        expect(articleOrErr.right.length).toBeTruthy();
        expect(articleOrErr.right.startsWith("<p>")).toBeTruthy();
    });
});


const groupNode: GroupNode = GroupNode.create({
    uuid: "--group-uuid--",
    owner: "owner@gmail.com",
    title: "Title",
    group: "--admins--",
    mimetype: Nodes.GROUP_MIMETYPE,
}).right;

const repository =  new InMemoryNodeRepository();
repository.add(groupNode);

const articleService = (opts: Partial<ArticleServiceContext> = { repository: repository }) => new ArticleService({
    storage: opts?.storage ?? new InMemoryStorageProvider(),
    repository: opts?.repository ?? new InMemoryNodeRepository(),
    bus: opts?.bus ?? new InMemoryEventBus(),
});

const errToMsg = (err: any) => (err.message ? err.message : JSON.stringify(err));