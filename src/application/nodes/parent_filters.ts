import type { NodeLike } from "domain/node_like.ts";
import {
	isNodeFilters2D,
	type NodeFilters,
	type NodeFilters1D,
	type NodeFilters2D,
	NodeFiltersSchema,
} from "domain/nodes/node_filter.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { ValidationResult } from "shared/specification.ts";
import { ValidationError } from "shared/validation_error.ts";
import { createRootFolder } from "./root_folder.ts";

/** Loads a node by uuid, without permission checks, to resolve parent-folder filters. */
export type GetNode = (uuid: string) => Promise<Either<AntboxError, NodeLike>>;

/** A GetNode that loads each uuid at most once, for several evaluations in one operation. */
export function cachedGetNode<E extends AntboxError>(
	getNode: (uuid: string) => Promise<Either<E, NodeLike>>,
): (uuid: string) => Promise<Either<E, NodeLike>> {
	const cache = new Map<string, Promise<Either<E, NodeLike>>>();
	return (uuid) => {
		if (!cache.has(uuid)) cache.set(uuid, getNode(uuid));
		return cache.get(uuid)!;
	};
}

/** True when any filter, in any AND group, has a parent-folder (`@field`) condition. */
export function hasParentFilter(filters: NodeFilters): boolean {
	return toGroups(filters).some((group) => group.some(([field]) => isParentField(field)));
}

/**
 * Checks one node against filters, resolving parent-folder conditions the way searches do.
 *
 * In each AND group, a condition whose field starts with `@` is evaluated, with the `@` removed,
 * against the node's parent folder, and the other conditions against the node itself; the groups
 * are OR-ed. The root folder, which is not stored, is the parent of top-level nodes. When the
 * parent cannot be loaded or is not a folder, every `@` condition fails. The parent is loaded once,
 * and only when an `@` condition exists.
 */
export async function filtersSatisfiedBy(
	filters: NodeFilters,
	node: NodeLike,
	getNode: GetNode,
): Promise<ValidationResult> {
	if (!hasParentFilter(filters) || !NodeFiltersSchema.safeParse(filters).success) {
		return NodesFilters.satisfiedBy(filters, node);
	}

	const parent = await loadParent(node, getNode);
	const satisfied = toGroups(filters).some((group) => {
		const own = group.filter(([field]) => !isParentField(field));
		const atParent = group
			.filter(([field]) => isParentField(field))
			.map(([field, operator, value]) => [field.substring(1), operator, value]) as NodeFilters1D;

		if (atParent.length && !parent) return false;
		if (atParent.length && NodesFilters.satisfiedBy(atParent, parent!).isLeft()) return false;
		return !own.length || NodesFilters.satisfiedBy(own, node).isRight();
	});

	return satisfied
		? right(true)
		: left(ValidationError.from(new BadRequestError("Node doesn't satisfy filters")));
}

async function loadParent(node: NodeLike, getNode: GetNode): Promise<NodeLike | undefined> {
	if (!node.parent) return undefined;
	if (node.parent === Nodes.ROOT_FOLDER_UUID) return createRootFolder();

	const parentOrErr = await getNode(node.parent);
	if (parentOrErr.isLeft()) return undefined;
	return Nodes.isFolder(parentOrErr.value) ? parentOrErr.value : undefined;
}

function toGroups(filters: NodeFilters): NodeFilters2D {
	return isNodeFilters2D(filters) ? filters : [filters as NodeFilters1D];
}

function isParentField(field: unknown): field is string {
	return typeof field === "string" && field.startsWith("@");
}
