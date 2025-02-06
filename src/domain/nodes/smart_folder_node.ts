import { Nodes } from "./nodes.ts";
import { NodeMetadata } from "./node_metadata.ts";
import { Node } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";
import { Either, right } from "../../shared/either.ts";
import { ValidationError } from "../../shared/validation_error.ts";

export class SmartFolderNode extends Node {
	static create(
		metadata: Partial<SmartFolderNode> = {},
	): Either<ValidationError, SmartFolderNode> {
		const node = new SmartFolderNode(metadata);
		return right(node);
	}

	aggregations: Aggregation[];
	filters: NodeFilter[];

	constructor(metadata: Partial<NodeMetadata> = {}) {
		super({ ...metadata, mimetype: Nodes.SMART_FOLDER_MIMETYPE });

		this.aggregations = metadata.aggregations ?? [];
		this.filters = metadata.filters ?? [];
	}

	hasAggregations(): boolean {
		return this.aggregations.length > 0;
	}
}

export interface Aggregation {
	title: string;
	fieldName: string;
	formula: AggregationFormula;
}

export type AggregationFormula =
	| "sum"
	| "count"
	| "avg"
	| "med"
	| "max"
	| "min"
	| "string";
