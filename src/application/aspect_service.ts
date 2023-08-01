import { Aspect } from "../domain/aspects/aspect.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { fileToAspect } from "./node_mapper.ts";
import { NodeService } from "./node_service.ts";

export class AspectService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		file: File,
		_metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (file.type !== Node.ASPECT_MIMETYPE) {
			return left(new BadRequestError(`Invalid file type ${file.type}`));
		}

		const aspect = (await file.text().then((t) => JSON.parse(t))) as Aspect;

		const metadata = NodeFactory.createFileMetadata(
			aspect.uuid,
			aspect.uuid,
			{
				title: aspect.title,
				description: aspect.description,
				parent: Node.ASPECTS_FOLDER_UUID,
			},
			Node.ASPECT_MIMETYPE,
			file.size,
		);

		return this.nodeService.createFile(file, metadata);
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

	async list(): Promise<Aspect[]> {
		const nodesOrErrs = await this.nodeService.list(Node.ASPECTS_FOLDER_UUID);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const aspectsPromises = nodesOrErrs.value.map((n) => this.get(n.uuid));

		const aspectsOrErrs = await Promise.all(aspectsPromises);
		const errs = aspectsOrErrs.filter((a) => a.isLeft());
		const aspects = aspectsOrErrs.filter((a) => a.isRight()).map((a) => a.value! as Aspect);

		if (errs.length > 0) {
			errs.forEach((e) => console.error(e.value));
		}

		return aspects;
	}
}
