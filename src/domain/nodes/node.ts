import { type Either, left, right } from "shared/either.ts";
import { FidGenerator } from "shared/fid_generator.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "./folders.ts";
import { type NodeMetadata } from "./node_metadata.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { z } from "zod";
import { toPropertyError, uuid } from "../validation_schemas.ts";

const NodeValidationSchema = z.object({
	uuid: uuid().min(1, "Node.uuid is required"),
	title: z.string().min(1, "Node.title is required")
		.min(3, "Node.title must be at least 3 characters"),
	mimetype: z.string()
		.regex(/^\w+\/[a-z0-9.+-]+(;\w+=.+)?$/, "Invalid Mimetype"),
	parent: z.string().min(1, "Node.parent is required"),
	owner: z.email().min(1, "Node.owner is required"),
});

export class Node {
	readonly uuid: string;
	protected readonly _mimetype: string;
	protected readonly _owner: string;
	protected readonly _createdTime: string;

	protected _fid: string;
	protected _title: string;
	protected _description?: string;
	protected _parent = Folders.ROOT_FOLDER_UUID;
	protected _modifiedTime: string;
	protected _fulltext: string;
	protected _tags: string[];
	protected _locked: boolean;
	protected _lockedBy: string;
	protected _unlockAuthorizedGroups: string[];
	protected _workflowInstanceUuid?: string;
	protected _workflowState?: string;

	constructor(metadata: Partial<NodeMetadata> = {}) {
		this.uuid = metadata?.uuid ?? UuidGenerator.generate();
		this._mimetype = metadata?.mimetype ?? "";
		this._fid = metadata?.fid ?? "";
		this._title = metadata?.title ?? "";
		this._description = metadata?.description;
		this._parent = metadata?.parent ?? Folders.ROOT_FOLDER_UUID;
		this._createdTime = metadata?.createdTime ?? new Date().toISOString();
		this._modifiedTime = metadata?.modifiedTime ?? new Date().toISOString();
		this._tags = metadata?.tags ?? [];
		this._locked = metadata?.locked ?? false;
		this._lockedBy = metadata?.lockedBy ?? "";
		this._unlockAuthorizedGroups = metadata?.unlockAuthorizedGroups ?? [];
		this._workflowInstanceUuid = metadata.workflowInstanceUuid ?? undefined;
		this._workflowState = metadata.workflowState ?? undefined;

		this._owner = metadata.owner!;

		this._fulltext = metadata?.fulltext ?? "";

		this._validateNode();

		if (!this._fid?.length) {
			this._fid = FidGenerator.generate(this._title);
		}
	}

	isJson(): boolean {
		return this._mimetype === "application/json";
	}

	protected _safeValidateNode(): ValidationError | undefined {
		const result = NodeValidationSchema.safeParse(this.metadata);

		if (!result.success) {
			const errors = result.error.issues.map(toPropertyError("Node"));
			return ValidationError.from(...errors);
		}

		return undefined;
	}

	protected _validateNode() {
		const error = this._safeValidateNode();

		if (error) {
			throw error;
		}
	}

	update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
		this._title = metadata.title ?? this._title;
		this._fid = metadata.fid ?? this._fid;
		this._description = metadata.description ?? this._description;
		this._parent = metadata.parent ?? this._parent;
		this._modifiedTime = new Date().toISOString();
		this._fulltext = metadata.fulltext ?? this._fulltext;
		this._tags = metadata.tags ?? this._tags;

		if (metadata.locked !== undefined) {
			this._locked = metadata.locked;
		}
		if (metadata.lockedBy !== undefined) {
			this._lockedBy = metadata.lockedBy;
		}
		if (metadata.unlockAuthorizedGroups !== undefined) {
			this._unlockAuthorizedGroups = metadata.unlockAuthorizedGroups;
		}

		if (!this._fid?.length) {
			this._fid = FidGenerator.generate(this._title);
		}

		try {
			this._validateNode();
		} catch (err) {
			return left(err as ValidationError);
		}

		return right(undefined);
	}

	get fid(): string {
		return this._fid;
	}

	get title(): string {
		return this._title;
	}

	get description(): string | undefined {
		return this._description;
	}

	get mimetype(): string {
		return this._mimetype;
	}

	get parent(): string {
		return this._parent;
	}

	get createdTime(): string {
		return this._createdTime;
	}

	get modifiedTime(): string {
		return this._modifiedTime;
	}

	get owner(): string {
		return this._owner;
	}

	get fulltext(): string {
		return this._fulltext;
	}

	get tags(): string[] {
		return this._tags;
	}

	get locked(): boolean {
		return this._locked;
	}

	get lockedBy(): string {
		return this._lockedBy;
	}

	get unlockAuthorizedGroups(): string[] {
		return this._unlockAuthorizedGroups;
	}

	get metadata(): Partial<NodeMetadata> {
		return {
			uuid: this.uuid,
			fid: this.fid,
			title: this.title,
			description: this.description,
			mimetype: this.mimetype,
			parent: this.parent,
			owner: this.owner,
			createdTime: this.createdTime,
			modifiedTime: this.modifiedTime,
			fulltext: this.fulltext,
			tags: this.tags,
			locked: this.locked,
			lockedBy: this.lockedBy,
			unlockAuthorizedGroups: this.unlockAuthorizedGroups,
		};
	}

	toJSON() {
		return this.metadata;
	}
}

export type Permission = "Read" | "Write" | "Export";

export type Permissions = {
	group: Permission[];
	authenticated: Permission[];
	anonymous: Permission[];
	advanced: Record<string, Permission[]>;
};
