import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { z } from "zod";
import { toPropertyError, uuid } from "../validation_schemas.ts";
import { WithAspectMixin } from "domain/nodes/with_aspect_mixin.ts";
import { ARTICLE_ASPECT } from "application/builtin_aspects/index.ts";

const ARTICLE_MIMETYPE = "application/vnd.antbox.article";

const ArticleNodeValidationSchema = z.object({
	uuid: uuid().min(1, "ArticleNode.uuid is required"),
	mimetype: z.literal(
		ARTICLE_MIMETYPE,
		"ArticleNode.mimetype must be application/vnd.antbox.article",
	),
});

export type LocaleMap = Record<string, string>;

export interface ArticleProperties {
	articleTitle: LocaleMap;
	articleFid: LocaleMap;
	articleResume: LocaleMap;
	articleBody: LocaleMap;
	articleAuthor: string;
}

export class ArticleNode extends WithAspectMixin(Node) {
	static create(
		metadata: Partial<NodeMetadata> & { properties: ArticleProperties },
	): Either<ValidationError, ArticleNode> {
		try {
			const node = new ArticleNode(metadata);
			return right(node);
		} catch (e) {
			return left(e as ValidationError);
		}
	}

	private constructor(metadata: Partial<NodeMetadata> & { properties: ArticleProperties }) {
		super({
			...metadata,
			mimetype: ARTICLE_MIMETYPE,
			aspects: [ARTICLE_ASPECT.uuid, ...(metadata.aspects ?? [])],
		});

		this._validateArticleNode();
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		const result = super.update({
			...metadata,
			mimetype: ARTICLE_MIMETYPE,
		});

		if (result.isLeft()) {
			return left(result.value);
		}

		try {
			this._validateArticleNode();
		} catch (e) {
			return left(e as ValidationError);
		}

		return right(undefined);
	}

	get articleProperties(): ArticleProperties {
		return this._properties as ArticleProperties;
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			properties: this._properties,
		};
	}

	private _validateArticleNode() {
		const errors: ValidationError[] = [];

		const nodeErrors = this._safeValidateNode();
		if (nodeErrors) {
			errors.push(nodeErrors);
		}

		const result = ArticleNodeValidationSchema.safeParse(this.metadata);
		if (!result.success) {
			const validationErrors = result.error.issues.map(toPropertyError("ArticleNode"));
			errors.push(ValidationError.from(...validationErrors));
		}

		const props = this._properties as ArticleProperties;
		if (!props.articleTitle || typeof props.articleTitle !== "object") {
			errors.push(
				ValidationError.from({
					property: "ArticleNode.properties.articleTitle",
					error: "articleTitle must be a locale map object",
				}),
			);
		}

		if (!props.articleFid || typeof props.articleFid !== "object") {
			errors.push(
				ValidationError.from({
					property: "ArticleNode.properties.articleFid",
					error: "articleFid must be a locale map object",
				}),
			);
		}

		if (!props.articleResume || typeof props.articleResume !== "object") {
			errors.push(
				ValidationError.from({
					property: "ArticleNode.properties.articleResume",
					error: "articleResume must be a locale map object",
				}),
			);
		}

		if (!props.articleBody || typeof props.articleBody !== "object") {
			errors.push(
				ValidationError.from({
					property: "ArticleNode.properties.articleBody",
					error: "articleBody must be a locale map object",
				}),
			);
		}

		if (!props.articleAuthor || typeof props.articleAuthor !== "string") {
			errors.push(
				ValidationError.from({
					property: "ArticleNode.properties.articleAuthor",
					error: "articleAuthor must be a string",
				}),
			);
		}

		if (errors.length > 0) {
			throw ValidationError.from(...errors.flatMap((e) => e.errors));
		}
	}
}
