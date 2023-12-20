import { DOMParser } from "../../deps.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { UnknownError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { WebContentAspect } from "./builtin_aspects/web_content_aspect.ts";
import { NodeService } from "./node_service.ts";
import { WebContent } from "./web_content.ts";

export class WebContentService {
	readonly #nodeService: NodeService;

	constructor(nodeService: NodeService) {
		this.#nodeService = nodeService;
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, WebContent>> {
		const nodeOrErr = await this.#nodeService.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		const node = nodeOrErr.value;

		if (
			node.mimetype !== "text/html" || !node.aspects?.includes(WebContentAspect.uuid)
		) {
			console.error("Node is not a web content");
			return left(new NodeNotFoundError(uuid));
		}

		const webContentOrErr = await this.#getWebContentText(node.uuid);
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
		uuid: string,
		lang: "pt" | "en" | "fr" | "es",
	): Promise<Either<NodeNotFoundError, string>> {
		const webContentOrErr = await this.get(uuid);
		if (webContentOrErr.isLeft()) {
			return left(webContentOrErr.value);
		}

		const node = webContentOrErr.value;

		return right(node[lang] ?? node.pt);
	}

	async #getWebContentText(
		uuid: string,
	): Promise<Either<NodeNotFoundError, Partial<WebContent>>> {
		const fileOrError = await this.#nodeService.export(uuid);
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
