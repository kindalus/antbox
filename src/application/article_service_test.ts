import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { test, expect, describe } from "bun:test";
import { NodeService } from "./node_service";
import { ArticleService, type ArticleDTO } from "./article_service";
import { Groups } from "domain/auth/groups";
import type { AuthenticationContext } from "./authentication_context";
import { Nodes } from "domain/nodes/nodes";
import { FolderNode } from "domain/nodes/folder_node";
import { BadRequestError } from "shared/antbox_error";
import { FileNode } from "domain/nodes/file_node";
import { parse } from "marked";
import { ArticleNotFound } from "domain/articles/article_not_found_error";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";

describe("ArticleService", () => {
    test("createOrReplace should create a article", async () => {
        const service = createService();

        const file = new File(["<p>Content</p>"], "javascript", {
            type: Nodes.ARTICLE_MIMETYPE,
        });
    
        const articleOrErr = await service.createOrReplace(adminAuthContext, file, {
            uuid: "--uuid--",
            title: "javascript",
            description: "The description",
            parent: "--parent--"
        });

        expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.right.title).toBe("javascript");
        expect(articleOrErr.right.parent).toBe("--parent--");
        expect(articleOrErr.right.description).toBe("The description");
        expect(articleOrErr.right.size).toBe(file.size);
    });  
    
    test("createOrReplace should replace existing article", async () => {
        const service = createService();

        const file = new File(["<p>Content</p>"], "javascript", {
            type: Nodes.ARTICLE_MIMETYPE,
        });

        await service.createOrReplace(adminAuthContext, file, articleDummy);  

        const newFile = new File(["<p>There is more things here</p>"], "python", {
            type: Nodes.ARTICLE_MIMETYPE,
        });
        
        const articleOrErr = await service.createOrReplace(adminAuthContext, newFile, {
            ...articleDummy,
            title: "Now python",
            description: "New Desc",
        });

        expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.right.title).toBe("Now python");
        expect(articleOrErr.right.description).toBe("New Desc");
        expect(articleOrErr.right.size).toBe(newFile.size);
    });

    test("createOrReplace should return error if uuid not provided", async () => {
        const service = createService();

        const articleOrErr = await service.createOrReplace(adminAuthContext, file, {
            uuid: "",
            title: "Title",
            parent: "--parent--",
            size: file.size,
        });

        expect(articleOrErr.isLeft(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.value).toBeInstanceOf(BadRequestError);
    });

    test("createOrReplace should return error if file mimetype is invalid", async () => {
        const service = createService();

        const file = new File(["<p>Content</p>"], "javascript", {
            type: "application/json",
        });

        const articleOrErr = await service.createOrReplace(adminAuthContext, file, {
            uuid: "--uuid--",
            title: "Title",
            parent: "--parent--",
            size: file.size,
        });

        expect(articleOrErr.isLeft(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.value).toBeInstanceOf(BadRequestError);
    });

    test("get should return an article", async () => {
        const service = createService();

        const file = new File(["<p>Content</p>"], "javascript", {
            type: Nodes.ARTICLE_MIMETYPE,
        });
    
        await service.createOrReplace(adminAuthContext, file, {
            uuid: "--uuid--",
            title: "javascript",
            description: "The description",
            parent: "--parent--"
        });

        const articleOrErr = await service.get(adminAuthContext ,"--uuid--");

        expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.right.title).toBe("javascript");
        expect(articleOrErr.right.parent).toBe("--parent--");
        expect(articleOrErr.right.description).toBe("The description");
        expect(articleOrErr.right.size).toBe(file.size);
    });

    test("get should return an article if mimetype is 'text/html' ", async () => {
        const service = createService();

        const articleOrErr = await service.get(adminAuthContext ,"--html--");

        expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.right.title).toBe("Html File");
        expect(articleOrErr.right.parent).toBe("--parent--");
        expect(articleOrErr.right.description).toBe("An html file");
        expect(articleOrErr.right.size).toBe(20);
    });

    test("get should return an article if mimetype is 'text/markdown' and parse content to html", async () => {
        const service = createService();

        const markdownFile = new File([`# The Title
        A list of file
        1. First
        2. Second
        3. Third
        `], "markdown", {
            type: "text/markdown",
        });
        const contentText = await parse( await markdownFile.text());

        const articleOrErr = await service.get(adminAuthContext ,"--markdown--");

        expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.right.title).toBe("Markdown File");
        expect(articleOrErr.right.parent).toBe("--parent--");
        expect(articleOrErr.right.description).toBe("An markdown file");
        expect(articleOrErr.right.content).toEqual(contentText);
    });

    test("get should return an article if mimetype is 'text/plain' and add content to paragraphs", async () => {
        const service = createService();

        const articleOrErr = await service.get(adminAuthContext ,"--txt--");

        expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.right.title).toBe("Txt File");
        expect(articleOrErr.right.parent).toBe("--parent--");
        expect(articleOrErr.right.description).toBe("Text plain file");
        expect(articleOrErr.right.content?.startsWith("<p>")).toBeTruthy();
    });

    test("get should return error if node is not article", async () => {
        const service = createService();

        const articleOrErr = await service.get(adminAuthContext ,"--json--");

        expect(articleOrErr.isLeft(), errMsg(articleOrErr.value)).toBeTruthy();
        expect(articleOrErr.value).toBeInstanceOf(ArticleNotFound);
    });

    test("delete should delete an article", async () => {
        const service = createService();

        await service.createOrReplace(adminAuthContext, file, articleDummy);
        
        const deleteOrErr = await service.delete(adminAuthContext, articleDummy.uuid);
        expect(deleteOrErr.isRight(), errMsg(deleteOrErr.value)).toBeTruthy();
    });

    test("delete should return error if node not found", async () => {
        const service = createService();

        await service.createOrReplace(adminAuthContext, file, articleDummy);
        
        const deleteOrErr = await service.delete(adminAuthContext, "--any uuid--");
        expect(deleteOrErr.isLeft(), errMsg(deleteOrErr.value)).toBeTruthy();
        expect(deleteOrErr.value).toBeInstanceOf(NodeNotFoundError);
    });
});

const adminAuthContext: AuthenticationContext = {
    mode: "Direct",
    tenant: "default",
    principal: {
      email: "admin@example.com",
      groups: [Groups.ADMINS_GROUP_UUID],
    },
};

const articleDummy: ArticleDTO = {
    uuid: "--the--uuid--",
    title: "javascript",
    description: "The description",
    parent: "--parent--"
}

function createService() {
    const parentNode: FolderNode = FolderNode.create({
        uuid: "--parent--",
        title: "Parent",
        owner: "user@gmail.com",
        group: "group-1",
    }).right;

    const htmlFileNode: FileNode = FileNode.create({
        uuid: "--html--",
        title: "Html File",
        parent: "--parent--",
        description: "An html file",
        size: 20,
        owner: "root@gmail.com",
        mimetype: "text/html",
        group: "The group",
    }).right;

    const htmlFile = new File([`
        <h1>The Title</h1>
        <p>A list of file</p>
        <ul>
            <li>1. First</li>
            <li>2. Second</li>
            <li>3. Third</li>
        </ul>
    `], "markdown", {
        type: "text/markdown",
    });

    const markdownFileNode: FileNode = FileNode.create({
        uuid: "--markdown--",
        title: "Markdown File",
        parent: "--parent--",
        description: "An markdown file",
        size: 20,
        owner: "root@gmail.com",
        mimetype: "text/markdown",
        group: "The group",
    }).right;

    const markdownFile = new File([`# The Title
        A list of file
        1. First
        2. Second
        3. Third
        `], "markdown", {
            type: "text/markdown",
    });

    const textPlainFileNode: FileNode = FileNode.create({
        uuid: "--txt--",
        title: "Txt File",
        parent: "--parent--",
        description: "Text plain file",
        size: 20,
        owner: "root@gmail.com",
        mimetype: "text/plain",
        group: "The group",
    }).right;

    const textPlainFile = new File([`The Title

    A list of file

    An good way to make this!
    `], "textplain", {
        type: "text/plain",
    });

    const jsonFileNode: FileNode = FileNode.create({
        uuid: "--json--",
        title: "Json File",
        parent: "--parent--",
        description: "Json file",
        size: 20,
        owner: "root@gmail.com",
        mimetype: "application/json",
        group: "The group",
    }).right;

    const jsonFile = new File([`Content`], "textplain", {
        type: "application/json",
    });

    const repository = new InMemoryNodeRepository();
    repository.add(parentNode);
    repository.add(htmlFileNode);
    repository.add(markdownFileNode);
    repository.add(textPlainFileNode);
    repository.add(jsonFileNode);

    const storage = new InMemoryStorageProvider();
    storage.write(markdownFileNode.uuid, markdownFile);
    storage.write(htmlFileNode.uuid, htmlFile);
    storage.write(textPlainFileNode.uuid, textPlainFile);
    storage.write(jsonFileNode.uuid, jsonFile);

    const eventBus = new InMemoryEventBus();
    const nodeService = new NodeService({ repository, storage, bus: eventBus });

    return new ArticleService({ repository, storage, bus: eventBus }, nodeService);
}

function errMsg(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    return String(err);
}

const file = new File(["<p>Content</p>"], "javascript", {
    type: Nodes.ARTICLE_MIMETYPE,
});