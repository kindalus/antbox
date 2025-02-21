import { type Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { type PropertyType } from "../aspects/aspect.ts";
import { Node } from "../nodes/node.ts";
import { type NodeMetadata } from "../nodes/node_metadata.ts";
import { Nodes } from "../nodes/nodes.ts";

export class FormSpecificationNode extends Node {
	static create(
		metadata: Partial<NodeMetadata> = {},
	): Either<ValidationError, FormSpecificationNode> {
		const node = new FormSpecificationNode(metadata);

		return right(node);
	}

	targetAspect: string;
	properties: FormPropertySpecification[];
	height: number;
	width: number;

	private constructor(metadata: Partial<NodeMetadata> = {}) {
		super({
			...metadata,
			mimetype: Nodes.FORM_SPECIFICATION_MIMETYPE,
		});

		this.targetAspect = metadata.targetAspect || "";
		this.properties = (metadata.properties as FormPropertySpecification[]) || [];

		this.height = metadata.height || 0;
		this.width = metadata.width || 0;
	}
}

export interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
	page: 1 | number;
}

export interface FormPropertySpecification {
	name: string;
	type: PropertyType;
	viewport: Viewport;
	formats?: string[];
}
