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
	_parameters: FeatureParameter[];
	get parameters(): FeatureParameter[] {
		return this._parameters;
	}

	_returnType:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";

	get returnType():
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void" {
		return this._returnType;
	}

	_returnDescription?: string;
	get returnDescription(): string | undefined {
		return this._returnDescription;
	}
	_returnContentType?: string;
	get returnContentType(): string | undefined {
		return this._returnContentType;
	}

	_runAs?: string;
	get runAs(): string | undefined {
		return this._runAs;
	}
	_groupsAllowed: string[];
	get groupsAllowed(): string[] {
		return this._groupsAllowed;
	}

	// Action exposure and action only execution settings
	// It is mandatory to have a parameter callled uuids of type `array` and arrayType `string`
	_exposeAction: boolean;
	get exposeAction(): boolean {
		return this._exposeAction;
	}
	_filters: NodeFilters;
	get filters(): NodeFilters {
		return this._filters;
	}
	_runOnUpdates: boolean;
	get runOnUpdates(): boolean {
		return this._runOnUpdates;
	}
	_runOnDeletes: boolean;
	get runOnDeletes(): boolean {
		return this._runOnDeletes;
	}
	_runManually: boolean;
	get runManually(): boolean {
		return this._runManually;
	}
	_runOnCreates: boolean;
	get runOnCreates(): boolean {
		return this._runOnCreates;
	}

	_exposeExtension: boolean;
	get exposeExtension(): boolean {
		return this._exposeExtension;
	}
	_exposeAITool: boolean;
	get exposeAITool(): boolean {
		return this._exposeAITool;
	}

	constructor(metadata: Partial<NodeMetadata>) {
		super({
			...metadata,
			mimetype: Nodes.FEATURE_MIMETYPE,
			parent: Folders.FEATURES_FOLDER_UUID,
		});

		this._parameters = metadata.parameters ?? [];
		this._filters = metadata.filters ?? [] as NodeFilters;
		this._returnType = metadata.returnType ?? "void";
		this._returnDescription = metadata.returnDescription!;
		this._returnContentType = metadata.returnContentType!;
		this._runAs = metadata.runAs;
		this._groupsAllowed = metadata.groupsAllowed ?? [];

		this._exposeAction = metadata.exposeAction ?? false;
		this._runOnCreates = this._exposeAction ? metadata.runOnCreates ?? false : false;
		this._runOnUpdates = metadata.exposeAction ? metadata.runOnUpdates ?? false : false;
		this._runOnDeletes = this._exposeAction ? metadata.runOnDeletes ?? false : false;
		this._runManually = metadata.exposeAction ? metadata.runManually ?? true : true;

		this._exposeExtension = metadata.exposeExtension ?? false;
		this._exposeAITool = metadata.exposeAITool ?? false;

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

		this._parameters = metadata.parameters ?? this._parameters;
		this._filters = metadata.filters ?? this._filters;
		this._returnType = metadata.returnType ?? this._returnType;
		this._returnDescription = metadata.returnDescription ?? this._returnDescription;
		this._returnContentType = metadata.returnContentType ?? this._returnContentType;
		this._runAs = metadata.runAs ?? this._runAs;
		this._groupsAllowed = metadata.groupsAllowed ?? this._groupsAllowed;

		this._exposeAction = metadata.exposeAction ?? this._exposeAction;
		this._runOnCreates = metadata.runOnCreates ?? this._runOnCreates;
		this._runOnUpdates = metadata.runOnUpdates ?? this._runOnUpdates;
		this._runOnDeletes = metadata.runOnDeletes ?? this._runOnDeletes;
		this._runManually = metadata.runManually ?? this._runManually;

		this._exposeExtension = metadata.exposeExtension ?? this._exposeExtension;
		this._exposeAITool = metadata.exposeAITool ?? this._exposeAITool;

		try {
			this._validateFeatureNode();
		} catch (e) {
			return left(e as ValidationError);
		}

		return right(undefined);
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			mimetype: Nodes.FEATURE_MIMETYPE,
			parent: Folders.FEATURES_FOLDER_UUID,
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
		if (!metadata.title) {
			return left(
				ValidationError.from(
					new AntboxError("ValidationError", "Title is required"),
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
