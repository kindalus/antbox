import { NodeFilters } from "domain/nodes/node_filter.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Node } from "domain/nodes/node.ts";
import { Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { FileMixin } from "domain/nodes/file_mixin.ts";
import z from "zod";
import { Folders } from "../nodes/folders.ts";
import { toPropertyError } from "../validation_schemas.ts";

const FeatureNodeValidationSchema = z.object({
	name: z.string().min(1, "Node.title is required"),
	mimetype: z.literal(
		Nodes.FEATURE_MIMETYPE,
		"FeatureNode.mimetype must be feature",
	),
	parent: z.literal(
		Folders.FEATURES_FOLDER_UUID,
		"FeatureNode.parent must be features folder",
	),
});

export type FeatureParameterType = "string" | "number" | "boolean" | "object" | "array" | "file";
export type FeatureParameterArrayType = "string" | "number" | "file" | "object";

export interface FeatureParameter {
	name: string;
	// Type file and array of files are allowed when the feature
	// is exposed as extension only
	type: FeatureParameterType;
	arrayType?: FeatureParameterArrayType;
	contentType?: string;
	required: boolean;
	description?: string;
	defaultValue?: string | number | boolean | object | Array<unknown>;
}

export class FeatureNode extends FileMixin(Node) {
	readonly name: string;
	readonly parameters: FeatureParameter[];

	readonly returnType:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	readonly returnDescription?: string;
	readonly returnContentType?: string;

	readonly runAs?: string;
	readonly groupsAllowed: string[];

	// Action exposure and action only execution settings
	// It is mandatory to have a parameter callled uuids of type `array` and arrayType `string`
	readonly exposeAction: boolean;
	readonly filters: NodeFilters;
	readonly runOnUpdates: boolean;
	readonly runOnDeletes: boolean;
	readonly runManually: boolean;
	readonly runOnCreates: boolean;

	readonly exposeExtension: boolean;
	readonly exposeAITool: boolean;

	constructor(metadata: Partial<NodeMetadata>) {
		super({
			...metadata,
			mimetype: Nodes.FEATURE_MIMETYPE,
			parent: Folders.FEATURES_FOLDER_UUID,
		});

		this.name = metadata.name || metadata.title!;
		this.parameters = metadata.parameters ?? [];
		this.filters = metadata.filters ?? [] as NodeFilters;
		this.returnType = metadata.returnType ?? "void";
		this.returnDescription = metadata.returnDescription!;
		this.returnContentType = metadata.returnContentType!;
		this.runAs = metadata.runAs;
		this.groupsAllowed = metadata.groupsAllowed ?? [];

		this.exposeAction = metadata.exposeAction ?? false;
		this.runOnCreates = this.exposeAction ? metadata.runOnCreates ?? false : false;
		this.runOnUpdates = metadata.exposeAction ? metadata.runOnUpdates ?? false : false;
		this.runOnDeletes = this.exposeAction ? metadata.runOnDeletes ?? false : false;
		this.runManually = metadata.exposeAction ? metadata.runManually ?? true : true;

		this.exposeExtension = metadata.exposeExtension ?? false;
		this.exposeAITool = metadata.exposeAITool ?? false;

		this._validateFeatureNode();
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		super.update({
			...metadata,
			mimetype: Nodes.FEATURE_MIMETYPE,
			parent: Folders.FEATURES_FOLDER_UUID,
		});

		try {
			this._validateFeatureNode();
		} catch (e) {
			return left(e as ValidationError);
		}

		return right(undefined);
	}

	override get metadata(): Partial<NodeMetadata> {
		return {
			...super.metadata,
			mimetype: Nodes.FEATURE_MIMETYPE,
			parent: Folders.FEATURES_FOLDER_UUID,
			name: this.name,
			exposeAction: this.exposeAction,
			runOnCreates: this.runOnCreates,
			runOnUpdates: this.runOnUpdates,
			runOnDeletes: this.runOnDeletes,
			runManually: this.runManually,
			filters: this.filters,
			exposeExtension: this.exposeExtension,
			exposeAITool: this.exposeAITool,
			runAs: this.runAs,
			groupsAllowed: this.groupsAllowed,
			parameters: this.parameters,
			returnType: this.returnType,
			returnDescription: this.returnDescription,
			returnContentType: this.returnContentType,
		};
	}

	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, FeatureNode> {
		if (!metadata.name && !metadata.title) {
			return left(
				ValidationError.from(
					new AntboxError("ValidationError", "Name or title is required"),
				),
			);
		}

		try {
			const node = new FeatureNode(metadata);
			return right(node);
		} catch (error) {
			return left(
				ValidationError.from(
					new AntboxError("ValidationError", (error as Error).message),
				),
			);
		}
	}

	protected _validateFeatureNode(): void {
		const errors: AntboxError[] = [];

		const nodeErrors = super._safeValidateNode();
		if (nodeErrors) {
			errors.push(...nodeErrors.errors);
		}

		const featureErrors = FeatureNodeValidationSchema.safeParse(this.metadata);
		if (!featureErrors.success) {
			errors.push(
				...(featureErrors.error.issues.map(toPropertyError("FeatureNode"))),
			);
		}

		if (this.exposeAction) {
			const uuidParam = this.parameters.find((p) => p.name === "uuids");

			if (
				!uuidParam ||
				uuidParam.type !== "array" ||
				uuidParam.arrayType !== "string"
			) {
				errors.push(
					new AntboxError(
						"ValidationError",
						'When "exposeAction" is true, a parameter called "uuids" of type array and arrayType string is required',
					),
				);
			}
		}

		const hasFileParam = this.parameters.some((p) => p.type === "file" || p.arrayType === "file");

		if (hasFileParam && (this.exposeAction || this.exposeAITool)) {
			errors.push(
				new AntboxError(
					"ValidationError",
					'Parameters of type "file" or arrayType "file" are not allowed when "exposeAction" or "exposeAITool" is true',
				),
			);
		}

		// Validate that runOnCreates, runOnUpdates, and runOnDeletes require filters
		if (
			(this.runOnCreates || this.runOnUpdates || this.runOnDeletes) &&
			(!this.filters || this.filters.length === 0)
		) {
			errors.push(
				new AntboxError(
					"ValidationError",
					'When "runOnCreates", "runOnUpdates", or "runOnDeletes" is true, "filters" must be defined and non-empty',
				),
			);
		}

		// Validate that runOnCreates, runOnUpdates, and runOnDeletes require exposeAction
		if ((this.runOnCreates || this.runOnUpdates || this.runOnDeletes) && !this.exposeAction) {
			errors.push(
				new AntboxError(
					"ValidationError",
					'When "runOnCreates", "runOnUpdates", or "runOnDeletes" is true, "exposeAction" must also be true',
				),
			);
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}
}
