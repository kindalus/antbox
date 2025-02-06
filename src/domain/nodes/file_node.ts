import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Constructor, Node, WithAspectMixin } from "./node.ts";
import { NodeMetadata } from "./node_metadata.ts";

export function FileNodeMixin<TBase extends Constructor>(Base: TBase) {
	return class extends Base {
		size: number;

		// deno-lint-ignore no-explicit-any
		constructor(...args: any[]) {
			super(...args);

			this.size = args[0]?.size ?? 0;
		}
	};
}

export class FileNode extends FileNodeMixin(WithAspectMixin(Node)) {
	static create(
		metadata: Partial<NodeMetadata>,
	): Either<ValidationError, FileNode> {
		const file = new FileNode(metadata);
		return right(file);
	}

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,

			mimetype: metadata.mimetype === "text/javascript"
				? "application/javascript"
				: metadata.mimetype,
		});
	}
}
