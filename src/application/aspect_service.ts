import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { NodeService } from "./node_service.ts";
import { Either, left, right } from "/shared/either.ts";
import { Aspect } from "/domain/aspects/aspect.ts";

import { Node } from "/domain/nodes/node.ts";
import { AntboxError, BadRequestError } from "/shared/antbox_error.ts";
import { fileToAspect } from "./node_mapper.ts";

export class AspectService {
	static isAspectsFolder(uuid: string): boolean {
		return uuid === Node.ASPECTS_FOLDER_UUID;
	}

	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		file: File,
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (!AspectService.isAspectsFolder(metadata.parent!)) {
			return left(
				new BadRequestError("Aspect must be created in the aspects folder"),
			);
		}

		if (file.type !== "application/json") {
			return left(new BadRequestError("File must be a json file"));
		}

		const aspect = (await file.text().then((t) => JSON.parse(t))) as Aspect;

		return this.nodeService.createFile(file, {
			uuid: aspect.uuid,
			fid: aspect.uuid,
			title: aspect.title,
			...metadata,
		});
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, Aspect>> {
		const nodePromise = this.nodeService.get(uuid);
		const aspectPromise = this.nodeService.export(uuid);

		const [nodeOrErr, aspectOrErr] = await Promise.all([
			nodePromise,
			aspectPromise,
		]);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (aspectOrErr.isLeft()) {
			return left(aspectOrErr.value);
		}

		if (nodeOrErr.value.parent !== Node.ASPECTS_FOLDER_UUID) {
			return left(new NodeNotFoundError(uuid));
		}

		const aspect = await fileToAspect(aspectOrErr.value);

		return right(aspect);
	}

	list(): Promise<Aspect[]> {
		return this.nodeService
			.list(Node.ASPECTS_FOLDER_UUID)
			.then((nodesOrErrs) => nodesOrErrs.value as Node[])
			.then((nodes) => nodes.map((n) => this.get(n.uuid)))
			.then((aspectsPromises) => Promise.all(aspectsPromises))
			.then((aspectsOrErrs) => aspectsOrErrs.map((a) => a.value as Aspect));
	}
}
