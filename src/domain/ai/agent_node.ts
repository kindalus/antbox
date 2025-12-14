import { AntboxError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { PropertyFormatError, PropertyRequiredError } from "domain/nodes/property_errors.ts";
import { z } from "zod";

const AgentValidationSchema = z.object({
	model: z.string().min(1, "Node.model is required"),
	temperature: z.number().min(0).max(2),
	maxTokens: z.number().min(1),
	reasoning: z.boolean(),
	useTools: z.boolean(),
	systemInstructions: z.string().min(1, "Node.systemInstructions is required"),
	structuredAnswer: z.string().optional(),
});

export class AgentNode extends Node {
	protected _model: string;
	protected _temperature: number;
	protected _maxTokens: number;
	protected _reasoning: boolean;
	protected _useTools: boolean;
	protected _systemInstructions: string;
	protected _structuredAnswer?: string;

	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, AgentNode> {
		try {
			const node = new AgentNode(metadata);
			return right(node);
		} catch (e) {
			return left(e as ValidationError);
		}
	}

	private constructor(metadata: Partial<NodeMetadata>) {
		super({
			...metadata,
			mimetype: Nodes.AGENT_MIMETYPE,
			parent: Folders.AGENTS_FOLDER_UUID,
		});

		this._model = metadata.model || "default";
		this._temperature = metadata.temperature ?? 0.7;
		this._maxTokens = metadata.maxTokens ?? 8192;
		this._reasoning = metadata.reasoning ?? false;
		this._useTools = metadata.useTools ?? false;
		this._systemInstructions = metadata.systemInstructions || "";
		this._structuredAnswer = metadata.structuredAnswer;

		this._validateAgentNode();
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		const superUpdateResult = super.update({
			...metadata,
			parent: Folders.AGENTS_FOLDER_UUID,
		});

		if (superUpdateResult.isLeft()) {
			return superUpdateResult;
		}

		this._model = metadata.model ?? this._model;
		this._temperature = metadata.temperature ?? this._temperature;
		this._maxTokens = metadata.maxTokens ?? this._maxTokens;
		this._reasoning = metadata.reasoning ?? this._reasoning;
		this._useTools = metadata.useTools ?? this._useTools;
		this._systemInstructions = metadata.systemInstructions ?? this._systemInstructions;
		this._structuredAnswer = metadata.structuredAnswer ?? this._structuredAnswer;

		try {
			this._validateAgentNode();
		} catch (e) {
			return left(e as ValidationError);
		}

		return right(undefined);
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			model: this._model,
			temperature: this._temperature,
			maxTokens: this._maxTokens,
			reasoning: this._reasoning,
			useTools: this._useTools,
			systemInstructions: this._systemInstructions,
			structuredAnswer: this._structuredAnswer,
		};
	}

	protected override _validateNode() {
		// Override to prevent base class validation before properties are set
		// Actual validation happens in _validateAgentNode
	}

	protected _validateAgentNode() {
		const errors: AntboxError[] = [];

		const nodeError = super._safeValidateNode();
		if (nodeError) {
			errors.push(...nodeError.errors);
		}

		const result = AgentValidationSchema.safeParse({
			model: this._model,
			temperature: this._temperature,
			maxTokens: this._maxTokens,
			reasoning: this._reasoning,
			useTools: this._useTools,
			systemInstructions: this._systemInstructions,
			structuredAnswer: this._structuredAnswer,
		});

		if (!result.success) {
			for (const issue of result.error.issues) {
				const fieldName = issue.path.length > 0 ? String(issue.path[0]) : "unknown";

				if (issue.code === "too_small" && issue.minimum === 1) {
					errors.push(new PropertyRequiredError(`Node.${fieldName}`));
				} else {
					errors.push(
						new PropertyFormatError(
							`Node.${fieldName}`,
							"valid format",
							issue.message,
						),
					);
				}
			}
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}

	get model(): string {
		return this._model;
	}

	get temperature(): number {
		return this._temperature;
	}

	get maxTokens(): number {
		return this._maxTokens;
	}

	get reasoning(): boolean {
		return this._reasoning;
	}

	get useTools(): boolean {
		return this._useTools;
	}

	get systemInstructions(): string {
		return this._systemInstructions;
	}

	get structuredAnswer(): string | undefined {
		return this._structuredAnswer;
	}
}
