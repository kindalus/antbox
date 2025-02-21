import { DOMParser } from "../../deps.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { Nodes } from "../domain/nodes/nodes.ts";
import { UnknownError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { AuthenticationContext } from "./authentication_context.ts";
import { NodeService } from "./node_service.ts";
import { WebContent } from "./web_content.ts";

export class WebcontentService {
	readonly #nodeService: NodeService;

	constructor(nodeService: NodeService) {
		this.#nodeService = nodeService;
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, WebContent>> {
		const nodeOrErr = await this.#nodeService.get(ctx, uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;
		if (!Nodes.isWebContent(node)) {
			return left(new NodeNotFoundError(uuid));
		}

		const webContentOrErr = await this.#getWebContentText(ctx, node.uuid);
		if (webContentOrErr.isLeft()) {
			return left(webContentOrErr.value);
		}

		return right({
			uuid: node.uuid,
			fid: node.fid,
			title: node.title,
			published: node.properties["web-content:published"] ?? false,
			...webContentOrErr.value,
		} as WebContent);
	}

	async getByLanguage(
		ctx: AuthenticationContext,
		uuid: string,
		lang: "pt" | "en" | "fr" | "es",
	): Promise<Either<NodeNotFoundError, string>> {
		const webContentOrErr = await this.get(ctx, uuid);
		if (webContentOrErr.isLeft()) {
			return left(webContentOrErr.value);
		}

		const node = webContentOrErr.value;

		if (!node[lang] && !["pt", "en", "es", "fr"].includes(lang)) {
			return left(new NodeNotFoundError(uuid));
		}

		return right(node[lang] ?? node.pt);
	}

	async #getWebContentText(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, Partial<WebContent>>> {
		const fileOrError = await this.#nodeService.export(ctx, uuid);
		if (fileOrError.isLeft()) {
			return left(fileOrError.value);
		}

		const html = await fileOrError.value.text();

		return this.#parseHtml(html);
	}

	#parseHtml(html: string): Either<UnknownError, Partial<WebContent>> {
		try {
			const document = new DOMParser().parseFromString(html, "text/html");

			if (!document) {
				return right({});
			}

			const pt = document.querySelector("template[lang='pt']")?.innerHTML ??
				document.querySelector("template:not([lang])")?.innerHTML ??
				"";

			const en = document.querySelector("template[lang='en']")?.innerHTML;
			const es = document.querySelector("template[lang='es']")?.innerHTML;
			const fr = document.querySelector("template[lang='fr']")?.innerHTML;

			return right({
				pt,
				en,
				es,
				fr,
			});
		} catch (e) {
			console.error("Error parsing web content", e);
			return left(new UnknownError("Error parsing web content"));
		}
	}
}
