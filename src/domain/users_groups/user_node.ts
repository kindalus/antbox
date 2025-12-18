import { Folders } from "domain/nodes/folders.ts";
import { Node } from "domain/nodes/node.ts";
import { type NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { z } from "zod";
import { toPropertyError } from "../validation_schemas.ts";

// TODO: added `active` property to user node
// non active users cannot login

const UserValidationSchema = z.object({
	// Title must have at least first name and last name
	title: z.string().regex(
		/^(\s*\S+(?:\s+\S+)+\s*|root|anonymous)$/,
		"Full name must include at least first name and last name",
	),
	group: z.string().min(1, "User must have at least one group"),
	email: z.email().min(1, "User email is required"),
	groups: z.array(z.string()),
	phone: z.string().optional(),
	hasWhatsapp: z.boolean(),
	active: z.boolean(),
});

export class UserNode extends Node {
	protected _email: string;
	protected _group: string;
	protected _groups: string[];
	protected _phone?: string;
	protected _hasWhatsapp: boolean;
	protected _active: boolean;

	static create(
		metadata: Partial<NodeMetadata> = {},
	): Either<ValidationError, UserNode> {
		try {
			const node = new UserNode(metadata);
			return right(node);
		} catch (err) {
			return left(err as ValidationError);
		}
	}

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.USER_MIMETYPE,
			parent: Folders.USERS_FOLDER_UUID,
		});

		this._groups = metadata?.groups ?? [];
		this._group = metadata?.group ?? this._groups[0];
		this._email = metadata.email!;
		this._phone = metadata?.phone;
		this._hasWhatsapp = metadata?.phone ? (metadata?.hasWhatsapp ?? false) : false;
		this._active = metadata?.active ?? true;

		this._validateUserNode();
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			email: this._email,
			group: this._group,
			groups: this._groups ?? [],
			phone: this._phone,
			hasWhatsapp: this._hasWhatsapp,
			active: this._active,
		};
	}

	override update(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, void> {
		const superUpdateResult = super.update({
			...metadata,
			parent: Folders.USERS_FOLDER_UUID,
		});

		if (superUpdateResult.isLeft()) {
			return superUpdateResult;
		}

		this._group = metadata?.group ?? this._group;
		this._groups = metadata?.groups ?? this._groups;
		this._phone = metadata?.phone ?? this._phone;
		this._hasWhatsapp = metadata?.phone ? (metadata?.hasWhatsapp ?? this._hasWhatsapp) : false;
		this._active = metadata?.active ?? this._active;

		try {
			this._validateUserNode();
		} catch (err) {
			return left(err as ValidationError);
		}

		return right(undefined);
	}

	protected _validateUserNode() {
		const errors: AntboxError[] = [];

		const nodeError = super._safeValidateNode();
		if (nodeError) {
			errors.push(...nodeError.errors);
		}

		const userValidation = UserValidationSchema.safeParse(this.metadata);
		if (!userValidation.success) {
			errors.push(
				...userValidation.error.issues.map(toPropertyError("UserNode")),
			);
		}

		if (errors.length) {
			throw ValidationError.from(...errors);
		}
	}

	get active(): boolean {
		return this._active;
	}

	get email(): string {
		return this._email;
	}

	get group(): string {
		return this._group;
	}

	get groups(): string[] {
		return this._groups;
	}

	get phone(): string | undefined {
		return this._phone;
	}

	get hasWhatsapp(): boolean {
		return this._hasWhatsapp;
	}
}
