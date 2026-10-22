import { Node } from "../nodes/node.ts";
import { type NodeMetadata } from "../nodes/node_metadata.ts";
import { WithAspectMixin } from "../nodes/with_aspect_mixin.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { z } from "zod";
import { toPropertyError, uuid } from "../validation_schemas.ts";
import {
	ARTICLE_BODY_CONTENT_TYPES,
	type ArticleBodyContentType,
	type ArticlePropertiesMap,
} from "./article_properties.ts";
import { Nodes } from "../nodes/nodes.ts";

const ArticleNodeValidationSchema = z.object({
	uuid: uuid().min(1, "ArticleNode.uuid is required"),
	mimetype: z.literal(
		Nodes.ARTICLE_MIMETYPE,
		"ArticleNode.mimetype must be application/vnd.antbox.article",
	),
	articleBodyContentType: z.enum(ARTICLE_BODY_CONTENT_TYPES),
	articleAuthor: z.string().min(1),
	articleProperties: z.record(
		z.string(),
		z.object({
			articleTitle: z.string().min(1),
			articleFid: z.string().min(1),
			articleResume: z.string().min(1),
			articleBody: z.string().min(1),
		}),
	).refine((properties) => Object.keys(properties).length > 0, {
		message: "ArticleNode.articleProperties is required",
	}),
});

export class ArticleNode extends WithAspectMixin(Node) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, ArticleNode> {
		try {
			const node = new ArticleNode(metadata);
			return right(node);
		} catch (e) {
			return left(e as ValidationError);
		}
	}

	private _articleProperties: ArticlePropertiesMap;
	private _articleAuthor: string;
	private _articleBodyContentType: ArticleBodyContentType;

	private constructor(
		metadata: Partial<NodeMetadata>,
	) {
		super({
			...metadata,
			mimetype: Nodes.ARTICLE_MIMETYPE,
			aspects: [...(metadata.aspects ?? [])],
		});

		this._articleProperties = metadata.articleProperties || {};
		this._articleAuthor = metadata.articleAuthor || "";
		this._articleBodyContentType = metadata.articleBodyContentType ?? "text";

		this._validateArticleNode();
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		const result = super.update({
			...metadata,
			mimetype: Nodes.ARTICLE_MIMETYPE,
		});

		if (result.isLeft()) {
			return left(result.value);
		}

		if (metadata.articleProperties !== undefined) {
			this._articleProperties = metadata.articleProperties;
		}

		if (metadata.articleAuthor !== undefined) {
			this._articleAuthor = metadata.articleAuthor;
		}

		if (metadata.articleBodyContentType !== undefined) {
			this._articleBodyContentType = metadata.articleBodyContentType;
		}

		try {
			this._validateArticleNode();
		} catch (e) {
			return left(e as ValidationError);
		}

		return right(undefined);
	}

	get articleProperties(): ArticlePropertiesMap {
		return this._articleProperties;
	}

	get articleAuthor(): string {
		return this._articleAuthor;
	}

	get articleBodyContentType(): ArticleBodyContentType {
		return this._articleBodyContentType;
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			articleProperties: this._articleProperties,
			articleAuthor: this._articleAuthor,
			articleBodyContentType: this._articleBodyContentType,
		};
	}

	private _validateArticleNode() {
		const errors: AntboxError[] = [];

		const nodeErrors = this._safeValidateNode();
		if (nodeErrors) {
			errors.push(nodeErrors);
		}

		const result = ArticleNodeValidationSchema.safeParse(this.metadata);
		if (!result.success) {
			const validationErrors = result.error.issues.map(toPropertyError("ArticleNode"));
			errors.push(ValidationError.from(...validationErrors));
		}

		if (errors.length > 0) {
			throw ValidationError.from(...errors);
		}
	}
}
