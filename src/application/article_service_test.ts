import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { describe, test } from "bdd";
import { expect } from "expect";
import { NodeService } from "application/node_service.ts";
import { ArticleService } from "application/article_service.ts";
import type { AuthenticationContext } from "application/authentication_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { parse } from "marked";
import { ArticleNotFound } from "domain/articles/article_not_found_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { ArticleDTO } from "application/article_dto.ts";
import { Groups } from "domain/users_groups/groups.ts";

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
			type: Nodes.ARTICLE_MIMETYPE,
		});

		await service.createOrReplace(adminAuthContext, file, articleDummy);

		const newFile = new File(["<p>There is more things here</p>"], "python", {
			type: Nodes.ARTICLE_MIMETYPE,
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
			parent: "--parent--",
		});

		const articleOrErr = await service.get(adminAuthContext, "--uuid--");

		expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
		expect(articleOrErr.right.title).toBe("javascript");
		expect(articleOrErr.right.parent).toBe("--parent--");
		expect(articleOrErr.right.description).toBe("The description");
		expect(articleOrErr.right.size).toBe(file.size);
	});

	test("get should return an article if mimetype is 'text/html' ", async () => {
		const service = createService();

		const articleOrErr = await service.get(adminAuthContext, "--html--");

		expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
		expect(articleOrErr.right.title).toBe("Html File");
		expect(articleOrErr.right.parent).toBe("--parent--");
		expect(articleOrErr.right.description).toBe("An html file");
		expect(articleOrErr.right.size).toBe(20);
	});

	test("get should return an article if mimetype is 'text/markdown' and parse content to html", async () => {
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
		const contentText = await parse(await markdownFile.text());

		const articleOrErr = await service.get(adminAuthContext, "--markdown--");

		expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
		expect(articleOrErr.right.title).toBe("Markdown File");
		expect(articleOrErr.right.parent).toBe("--parent--");
		expect(articleOrErr.right.description).toBe("An markdown file");
		expect(articleOrErr.right.content).toEqual(contentText);
	});

	test("get should return an article if mimetype is 'text/plain' and add content to paragraphs", async () => {
		const service = createService();

		const articleOrErr = await service.get(adminAuthContext, "--txt--");

		expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
		expect(articleOrErr.right.title).toBe("Txt File");
		expect(articleOrErr.right.parent).toBe("--parent--");
		expect(articleOrErr.right.description).toBe("Text plain file");
		expect(articleOrErr.right.content?.startsWith("<p>")).toBeTruthy();
	});

	test("get should return error if node is not article", async () => {
		const service = createService();

		const articleOrErr = await service.get(adminAuthContext, "--json--");

		expect(articleOrErr.isLeft(), errMsg(articleOrErr.value)).toBeTruthy();
		expect(articleOrErr.value).toBeInstanceOf(ArticleNotFound);
	});

	test("getByLang should return an article according language", async () => {
		const service = createService();

		const file = new File([html], "filename", {
			type: Nodes.ARTICLE_MIMETYPE,
		});

		await service.createOrReplace(adminAuthContext, file, {
			uuid: "--unique--",
			title: "Title",
			description: "Description",
			parent: "--parent--",
		});

		const articleOrErr = await service.getByLang(
			adminAuthContext,
			"--unique--",
			"en",
		);

		expect(articleOrErr.isRight(), errMsg(articleOrErr.value)).toBeTruthy();
		expect(articleOrErr.right.title).toBe("Title");
		expect(articleOrErr.right.parent).toBe("--parent--");
		expect(articleOrErr.right.size).toBe(file.size);
		expect(articleOrErr.right.content?.includes("Article Title (EN)"))
			.toBeTruthy();
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
			type: Nodes.ARTICLE_MIMETYPE,
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
		expect(articles.length).toBe(2);
	});

	test("export should create a JSON file for article", async () => {
		const service = createService();

		await service.createOrReplace(adminAuthContext, file, articleDummy);

		const fileOrErr = await service.export(adminAuthContext, articleDummy.uuid);

		expect(fileOrErr.isRight(), errMsg(fileOrErr.value)).toBeTruthy();
		expect(fileOrErr.right.type).toBe("application/json");
		expect(fileOrErr.right.name).toBe(`${articleDummy.uuid}.json`);

		const content = JSON.parse(await fileOrErr.right.text());
		expect(content.uuid).toBe(articleDummy.uuid);
		expect(content.title).toBe(articleDummy.title);
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
	type: Nodes.ARTICLE_MIMETYPE,
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
