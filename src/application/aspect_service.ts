import { aspectToNode, nodeToAspect } from "../domain/aspects/aspect.ts";
import { AspectNode } from "../domain/aspects/aspect_node.ts";
import { AspectNotFoundError } from "../domain/aspects/aspect_not_found_error.ts";
import { Folders } from "../domain/nodes/folders.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { Nodes } from "../domain/nodes/nodes.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { AuthService } from "./auth_service.ts";
import { AuthenticationContext } from "./authentication_context.ts";
import { builtinAspects } from "./builtin_aspects/mod.ts";

import { NodeService } from "./node_service.ts";

export class AspectService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		ctx: AuthenticationContext,
		metadata: Partial<AspectNode>,
	): Promise<Either<AntboxError, AspectNode>> {
		if (!metadata.uuid) {
			return left(new BadRequestError("Aspect UUID is required"));
		}

		const nodeOrErr = await this.nodeService.get(ctx, metadata.uuid);

		if (nodeOrErr.isRight() && !Nodes.isAspect(nodeOrErr.value)) {
			return left(new BadRequestError("Node exists and is not an aspect"));
		}

		if (nodeOrErr.isLeft()) {
			return AspectNode.create(metadata);
		}

		const voidOrErr = await this.nodeService.update(ctx, metadata.uuid, metadata);
		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return this.nodeService.get(ctx, metadata.uuid) as Promise<Either<AntboxError, AspectNode>>;
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, AspectNode>> {
		const builtin = builtinAspects.find((aspect) => aspect.uuid === uuid);
		if (builtin) {
			return right(aspectToNode(builtin));
		}

		const nodeOrErr = await this.nodeService.get(AuthService.elevatedContext(), uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isAspect(nodeOrErr.value)) {
			return left(new AspectNotFoundError(uuid));
		}

		return right(nodeOrErr.value);
	}

	async list(): Promise<AspectNode[]> {
		const nodesOrErrs = await this.nodeService.find(AuthService.elevatedContext(), [
			["mimetype", "==", Nodes.ASPECT_MIMETYPE],
			["parent", "==", Folders.ASPECTS_FOLDER_UUID],
		], Number.MAX_SAFE_INTEGER);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const usersAspects = nodesOrErrs.value.nodes as AspectNode[];
		const systemAspects = builtinAspects.map(aspectToNode);

		return [...usersAspects, ...systemAspects].sort((a, b) => a.#titlee.localeCompare(b#titlele));
	}

	async delete(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.nodeService.get(ctx, uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!Nodes.isAspect(nodeOrErr.value)) {
			return left(new AspectNotFoundError(uuid));
		}

		return this.nodeService.delete(ctx, uuid);
	}

	async export(
		node: string | AspectNode,
	): Promise<Either<NodeNotFoundError, File>> {
		let aspect = typeof node !== "string" ? nodeToAspect(node) : undefined;

		if (typeof node === "string") {
			const nodeOrErr = await this.get(node);
			if (nodeOrErr.isLeft()) {
				return left(nodeOrErr.value);
			}

			aspect = nodeToAspect(nodeOrErr.value);
		}

		const file = new File(
			[JSON.stringify(aspect, null, 2)],
			`${aspect?.uuid}.json`,
			{ type: "application/json" },
		);

		return right(file);
	}
}
