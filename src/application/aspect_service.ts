import { Aspect, nodeToAspect } from "../domain/aspects/aspect.ts";
import { AspectNode } from "../domain/aspects/aspect_node.ts";
import { AspectNotFoundError } from "../domain/aspects/aspect_not_found_error.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { builtinAspects } from "./builtin_aspects/mod.ts";

import { NodeService } from "./node_service.ts";

export class AspectService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		aspect: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		const nodeOrErr = await this.nodeService.get(aspect.uuid ?? "");

		if (nodeOrErr.isRight() && !nodeOrErr.value.isAspect()) {
			return left(new BadRequestError("Node exists and is not an aspect"));
		}

		if (nodeOrErr.isLeft()) {
			const metadata = NodeFactory.createMetadata(
				aspect.uuid!,
				aspect.uuid!,
				Node.ASPECT_MIMETYPE,
				0,
				{
					title: aspect.title,
					description: aspect.description,
				},
			);

			return this.nodeService.create(metadata);
		}

		const metadata = NodeFactory.extractMetadata(aspect);
		const voidOrErr = await this.nodeService.update(aspect.uuid!, metadata);

		if (voidOrErr.isLeft()) {
			return left(voidOrErr.value);
		}

		return this.nodeService.get(metadata.uuid!);
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, Aspect>> {
		const nodeOrErr = await this.nodeService.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!nodeOrErr.value.isAspect()) {
			return left(new AspectNotFoundError(uuid));
		}

		const aspect = nodeToAspect(nodeOrErr.value);

		return right(aspect);
	}

	async list(): Promise<Aspect[]> {
		const nodesOrErrs = await this.nodeService.list(Node.ASPECTS_FOLDER_UUID);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const usersAspects = nodesOrErrs.value
			.map((n) => nodeToAspect(n as AspectNode));

		return [
			...usersAspects,
			...builtinAspects,
		].sort((a, b) => a.title.localeCompare(b.title));
	}

	async export(node: string | AspectNode): Promise<Either<NodeNotFoundError, File>> {
		let aspect = typeof (node) !== "string" ? nodeToAspect(node) : undefined;

		if (typeof (node) === "string") {
			const nodeOrErr = await this.get(node);
			if (nodeOrErr.isLeft()) {
				return left(nodeOrErr.value);
			}

			aspect = nodeOrErr.value;
		}

		const file = new File(
			[JSON.stringify(aspect, null, 2)],
			`${aspect?.uuid}.json`,
			{ type: "application/json" },
		);

		return right(file);
	}
}
