import { Node } from "../nodes/node.ts";
import { type NodeMetadata } from "../nodes/node_metadata.ts";
import { PropertyRequiredError, PropertyTypeError } from "../nodes/property_errors.ts";
import { WithAspectMixin } from "../nodes/with_aspect_mixin.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { z } from "zod";
import { toPropertyError, uuid } from "../validation_schemas.ts";
import { type ArticleProperties, type ArticlePropertiesMap } from "./article_properties.ts";
import { Nodes } from "../nodes/nodes.ts";

const ArticleNodeValidationSchema = z.object({
	uuid: uuid().min(1, "ArticleNode.uuid is required"),
	mimetype: z.literal(
		Nodes.ARTICLE_MIMETYPE,
		"ArticleNode.mimetype must be application/vnd.antbox.article",
	),
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

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			articleProperties: this._articleProperties,
			articleAuthor: this._articleAuthor,
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

		if (!this._articleProperties || typeof this._articleProperties !== "object") {
			errors.push(
				new PropertyTypeError(
					"ArticleNode._articleProperties",
					"object",
					typeof this._articleProperties,
				),
			);
		} else {
			// Validate each locale's properties
			for (const [locale, localizedProps] of Object.entries(this._articleProperties)) {
				if (typeof localizedProps !== "object") {
					errors.push(
						new PropertyTypeError(
							`ArticleNode._articleProperties.${locale}`,
							"object",
							typeof localizedProps,
						),
					);
					continue;
				}

				const articleProps = localizedProps as ArticleProperties;

				if (!articleProps.articleTitle || typeof articleProps.articleTitle !== "string") {
					errors.push(
						articleProps.articleTitle
							? new PropertyTypeError(
								`ArticleNode._articleProperties.${locale}.articleTitle`,
								"string",
								typeof articleProps.articleTitle,
							)
							: new PropertyRequiredError(
								`ArticleNode._articleProperties.${locale}.articleTitle`,
							),
					);
				}

				if (!articleProps.articleFid || typeof articleProps.articleFid !== "string") {
					errors.push(
						articleProps.articleFid
							? new PropertyTypeError(
								`ArticleNode._articleProperties.${locale}.articleFid`,
								"string",
								typeof articleProps.articleFid,
							)
							: new PropertyRequiredError(
								`ArticleNode._articleProperties.${locale}.articleFid`,
							),
					);
				}

				if (!articleProps.articleResume || typeof articleProps.articleResume !== "string") {
					errors.push(
						articleProps.articleResume
							? new PropertyTypeError(
								`ArticleNode._articleProperties.${locale}.articleResume`,
								"string",
								typeof articleProps.articleResume,
							)
							: new PropertyRequiredError(
								`ArticleNode._articleProperties.${locale}.articleResume`,
							),
					);
				}

				if (!articleProps.articleBody || typeof articleProps.articleBody !== "string") {
					errors.push(
						articleProps.articleBody
							? new PropertyTypeError(
								`ArticleNode._articleProperties.${locale}.articleBody`,
								"string",
								typeof articleProps.articleBody,
							)
							: new PropertyRequiredError(
								`ArticleNode._articleProperties.${locale}.articleBody`,
							),
					);
				}
			}
		}

		if (!this._articleAuthor || typeof this._articleAuthor !== "string") {
			errors.push(
				this._articleAuthor
					? new PropertyTypeError(
						"ArticleNode.articleAuthor",
						"string",
						typeof this._articleAuthor,
					)
					: new PropertyRequiredError("ArticleNode.articleAuthor"),
			);
		}

		if (errors.length > 0) {
			throw ValidationError.from(...errors);
		}
	}
}
