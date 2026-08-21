import type { NodeLike } from "domain/node_like.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import type { NodeUpdateChanges } from "domain/nodes/node_updated_event.ts";
import type { Either } from "shared/either.ts";
import { left, right } from "shared/either.ts";
import type { ValidationError } from "shared/validation_error.ts";

interface CalculatedNodeUpdateChanges {
	changed: Omit<NodeUpdateChanges, "uuid">;
	requested: Omit<NodeUpdateChanges, "uuid">;
}

export function calculateNodeUpdateChanges(
	currentMetadata: NodeMetadata,
	requestedMetadata: Partial<NodeMetadata>,
): Either<ValidationError, CalculatedNodeUpdateChanges> {
	const metadata = comparableMetadata(requestedMetadata);
	const previewOrErr = NodeFactory.from<NodeLike>(currentMetadata);
	if (previewOrErr.isLeft()) {
		return left(previewOrErr.value);
	}

	const updatePreviewOrErr = previewOrErr.value.update(metadata);
	if (updatePreviewOrErr.isLeft()) {
		return left(updatePreviewOrErr.value);
	}

	const previewMetadata = previewOrErr.value.metadata;
	const changedOldValues: Partial<NodeMetadata> = {};
	const changedNewValues: Partial<NodeMetadata> = {};
	const requestedOldValues: Partial<NodeMetadata> = {};
	const requestedNewValues: Partial<NodeMetadata> = {};

	for (const key of Object.keys(metadata) as (keyof NodeMetadata)[]) {
		const currentValue = currentMetadata[key];
		const previewValue = previewMetadata[key];

		assignMetadataValue(requestedOldValues, key, currentValue);
		assignMetadataValue(requestedNewValues, key, previewValue);

		if (metadataValuesEqual(currentValue, previewValue)) {
			continue;
		}

		assignMetadataValue(changedOldValues, key, currentValue);
		assignMetadataValue(changedNewValues, key, previewValue);
	}

	return right({
		changed: {
			oldValues: changedOldValues,
			newValues: changedNewValues,
		},
		requested: {
			oldValues: requestedOldValues,
			newValues: requestedNewValues,
		},
	});
}

function comparableMetadata(metadata: Partial<NodeMetadata>): Partial<NodeMetadata> {
	const comparable: Partial<NodeMetadata> = { ...metadata };
	delete comparable.modifiedTime;
	delete comparable.fulltext;

	for (const key of Object.keys(comparable) as (keyof NodeMetadata)[]) {
		if (key !== "properties" && comparable[key] === undefined) {
			delete comparable[key];
		}
	}

	return comparable;
}

function assignMetadataValue(
	metadata: Partial<NodeMetadata>,
	key: keyof NodeMetadata,
	value: unknown,
): void {
	(metadata as Record<string, unknown>)[key] = value;
}

function metadataValuesEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) {
		return true;
	}

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}

		return a.every((item, index) => metadataValuesEqual(item, b[index]));
	}

	if (isComparableObject(a) || isComparableObject(b)) {
		if (!isComparableObject(a) || !isComparableObject(b)) {
			return false;
		}

		const aEntries = Object.entries(a).filter(([, value]) => value !== undefined);
		const bEntries = Object.entries(b).filter(([, value]) => value !== undefined);
		if (aEntries.length !== bEntries.length) {
			return false;
		}

		const bValues = Object.fromEntries(bEntries);
		return aEntries.every(([key, value]) =>
			Object.hasOwn(bValues, key) && metadataValuesEqual(value, bValues[key])
		);
	}

	return false;
}

function isComparableObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
