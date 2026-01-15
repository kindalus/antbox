import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Node } from "./node.ts";
import type { NodeMetadata } from "./node_metadata.ts";
import { WithAspectMixin } from "domain/nodes/with_aspect_mixin.ts";

export class FileNode extends WithAspectMixin(Node) {
	protected _size: number;
	protected _cdnUrl?: string;

	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, FileNode> {
		try {
			return right(new FileNode(metadata));
		} catch (error) {
			return left(error as ValidationError);
		}
	}

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,

			mimetype: metadata.mimetype === "text/javascript"
				? "application/javascript"
				: metadata.mimetype,
		});

		this._size = metadata.size ?? 0;
		this._cdnUrl = metadata.cdnUrl;
	}

	get size(): number {
		return this._size;
	}

	get cdnUrl(): string | undefined {
		return this._cdnUrl;
	}

	override get metadata(): NodeMetadata {
		return {
			...super.metadata,
			size: this._size,
			cdnUrl: this._cdnUrl,
		};
	}

	override update(metadata: Partial<NodeMetadata>): Either<ValidationError, void> {
		this._size = metadata.size ?? this._size;
		this._cdnUrl = metadata.cdnUrl ?? this._cdnUrl;
		return super.update(metadata);
	}
}
