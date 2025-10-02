import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { describe, test } from "bdd";
import { expect } from "expect";
import { NodeService } from "application/node_service.ts";
import { ArticleService } from "application/article_service.ts";
import type { AuthenticationContext } from "application/authentication_context.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { parse } from "marked";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";

import { Groups } from "domain/users_groups/groups.ts";

describe("ArticleService", () => {
	test("createOrReplace should create a article", async () => {
		const service = createService();

		const file = new File(["<p>Content</p>"], "javascript", {
			type: "text/html",
		});

		const articleOrErr = await service.createOrReplace(adminAuthContext, file, {
			uuid: "--uuid--",
			title: "javascript",
			description: "The description",
			parent: "--parent--",
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
			type: "text/html",
		});

		await service.createOrReplace(adminAuthContext, file, articleDummy);

		const newFile = new File(["<p>There is more things here</p>"], "python", {
			type: "text/html",
		});

		const articleOrErr = await service.createOrReplace(
			adminAuthContext,
			newFile,
			{
				...articleDummy,
				title: "Now python",
				description: "New Desc",
			},
		);

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
		});

		expect(articleOrErr.isLeft(), errMsg(articleOrErr.value)).toBeTruthy();
		expect(articleOrErr.value).toBeInstanceOf(BadRequestError);
	});

	test("get should return HTML content", async () => {
		const service = createService();

		const file = new File(["<p>Content</p>"], "javascript", {
			type: "text/html",
		});

		await service.createOrReplace(adminAuthContext, file, {
			uuid: "--uuid--",
			title: "javascript",
			description: "The description",
			parent: "--parent--",
		});

		const htmlOrErr = await service.get(adminAuthContext, "--uuid--");

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right).toBe("<p>Content</p>");
	});

	test("get should return HTML content if mimetype is 'text/html' ", async () => {
		const service = createService();

		const htmlOrErr = await service.get(adminAuthContext, "--html--");

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right).toContain("<h1>The Title</h1>");
	});

	test("get should convert markdown to HTML", async () => {
		const service = createService();

		const markdownFile = new File(
			[
				`# The Title
        A list of file
        1. First
        2. Second
        3. Third
        `,
			],
			"markdown",
			{
				type: "text/markdown",
			},
		);
		const expectedHtml = await parse(await markdownFile.text());

		const htmlOrErr = await service.get(adminAuthContext, "--markdown--");

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right).toEqual(expectedHtml);
	});

	test("get should convert text/plain to HTML paragraphs", async () => {
		const service = createService();

		const htmlOrErr = await service.get(adminAuthContext, "--txt--");

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right.startsWith("<p>")).toBeTruthy();
		expect(htmlOrErr.right).toContain("The Title");
	});

	test("get should return error if node is not article", async () => {
		const service = createService();

		const htmlOrErr = await service.get(adminAuthContext, "--json--");

		expect(htmlOrErr.isLeft(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	test("get with lang parameter should return HTML filtered by language", async () => {
		const service = createService();

		const file = new File([html], "filename", {
			type: "text/html",
		});

		await service.createOrReplace(adminAuthContext, file, {
			uuid: "--unique--",
			title: "Title",
			description: "Description",
			parent: "--parent--",
		});

		const htmlOrErr = await service.get(
			adminAuthContext,
			"--unique--",
			"en",
		);

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right.includes("Article Title (EN)")).toBeTruthy();
	});

	test("delete should remove an article", async () => {
		const service = createService();

		await service.createOrReplace(adminAuthContext, file, articleDummy);

		const deleteOrErr = await service.delete(
			adminAuthContext,
			articleDummy.uuid,
		);
		expect(deleteOrErr.isRight(), errMsg(deleteOrErr.value)).toBeTruthy();
	});

	test("delete should return error if node not found", async () => {
		const service = createService();

		await service.createOrReplace(adminAuthContext, file, articleDummy);

		const deleteOrErr = await service.delete(adminAuthContext, "--any uuid--");
		expect(deleteOrErr.isLeft(), errMsg(deleteOrErr.value)).toBeTruthy();
		expect(deleteOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	test("list should list all articles", async () => {
		const service = createService();

		const file = new File(["<p>Content</p>"], "javascript", {
			type: "text/html",
		});

		await service.createOrReplace(adminAuthContext, file, {
			uuid: "--uuid--",
			title: "javascript",
			description: "The description",
			parent: "--parent--",
		});

		await service.createOrReplace(adminAuthContext, file, {
			uuid: "--new uuid--",
			title: "python",
			description: "The description",
			parent: "--parent--",
		});

		const articles = await service.list(adminAuthContext);

		console.debug(articles);

		expect(articles.length).toBe(2);
	});

	test("get should return HTML string for HTML article", async () => {
		const service = createService();

		await service.createOrReplace(adminAuthContext, file, articleDummy);

		const htmlOrErr = await service.get(adminAuthContext, articleDummy.uuid);

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right).toBe("<p>Content</p>");
	});

	test("get should convert markdown article to HTML string", async () => {
		const service = createService();

		const markdownFile = new File(
			["# Hello World\n\nThis is **bold** text."],
			"article.md",
			{ type: "text/markdown" },
		);

		await service.createOrReplace(adminAuthContext, markdownFile, {
			uuid: "--markdown-export--",
			title: "Markdown Article",
			description: "A markdown article",
			parent: "--parent--",
		});

		const htmlOrErr = await service.get(
			adminAuthContext,
			"--markdown-export--",
		);

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right).toContain("<h1>");
		expect(htmlOrErr.right).toContain("Hello World");
		expect(htmlOrErr.right).toContain("<strong>bold</strong>");
	});

	test("get should convert plain text article to HTML string", async () => {
		const service = createService();

		const textFile = new File(
			["First paragraph\n\nSecond paragraph\n\nThird paragraph"],
			"article.txt",
			{ type: "text/plain" },
		);

		await service.createOrReplace(adminAuthContext, textFile, {
			uuid: "--text-export--",
			title: "Text Article",
			description: "A plain text article",
			parent: "--parent--",
		});

		const htmlOrErr = await service.get(
			adminAuthContext,
			"--text-export--",
		);

		expect(htmlOrErr.isRight(), errMsg(htmlOrErr.value)).toBeTruthy();
		expect(htmlOrErr.right).toContain("<p>First paragraph</p>");
		expect(htmlOrErr.right).toContain("<p>Second paragraph</p>");
		expect(htmlOrErr.right).toContain("<p>Third paragraph</p>");
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

const articleDummy = {
	uuid: "--the--uuid--",
	title: "javascript",
	description: "The description",
	parent: "--parent--",
};

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

	const htmlFile = new File(
		[
			`
        <h1>The Title</h1>
        <p>A list of file</p>
        <ul>
            <li>1. First</li>
            <li>2. Second</li>
            <li>3. Third</li>
        </ul>
    `,
		],
		"markdown",
		{
			type: "text/markdown",
		},
	);

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

	const markdownFile = new File(
		[
			`# The Title
        A list of file
        1. First
        2. Second
        3. Third
        `,
		],
		"markdown",
		{
			type: "text/markdown",
		},
	);

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

	const textPlainFile = new File(
		[
			`The Title

    A list of file

    An good way to make this!
    `,
		],
		"textplain",
		{
			type: "text/plain",
		},
	);

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

	return new ArticleService(
		{ repository, storage, bus: eventBus },
		nodeService,
	);
}

function errMsg(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}

const file = new File(["<p>Content</p>"], "javascript", {
	type: "text/html",
});

const html = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conteúdo Multilíngue</title>
</head>
<body>

    <main>
        <h1>Bem-vindo ao nosso site</h1>
        <p>Este é o conteúdo principal, que será exibido se não houver um template específico para o idioma do usuário.</p>
    </main>

    <template lang="pt">
        <article>
            <h2>Título do Artigo (PT)</h2>
            <p>Este é o conteúdo do artigo em português.</p>
            <img src="imagem-pt.jpg" alt="Imagem em português">
        </article>
    </template>

    <template lang="en">
        <article>
            <h2>Article Title (EN)</h2>
            <p>This is the article content in English.</p>
            <img src="image-en.jpg" alt="Image in English">
        </article>
    </template>

    <template lang="fr">
        <article>
            <h2>Titre de l'Article (FR)</h2>
            <p>Ceci est le contenu de l'article en français.</p>
            <img src="image-fr.jpg" alt="Image en français">
        </article>
    </template>

    <template lang="es">
        <article>
            <h2>Título del Artículo (ES)</h2>
            <p>Este es el contenido del artículo en español.</p>
            <img src="imagen-es.jpg" alt="Imagen en español">
        </article>
    </template>

</body>
</html>`;
