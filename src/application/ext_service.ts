import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { NodeService } from "./node_service.ts";

export type ExtFn = (
	request: Request,
	service: NodeService,
) => Promise<Response>;

export class ExtService {
	constructor(private readonly nodeService: NodeService) {}

	createOrReplace(
		file: File,
		_metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (file.type !== Node.EXT_MIMETYPE) {
			return Promise.resolve(
				left(new BadRequestError(`Invalid mimetype: ${file.type}`)),
			);
		}

		const uuid = file.name?.split(".")[0].trim();

		const metadata = NodeFactory.createFileMetadata(
			uuid,
			uuid,
			{
				title: uuid,
				parent: Node.EXT_FOLDER_UUID,
			},
			Node.EXT_MIMETYPE,
			file.size,
		);

		return this.nodeService.createFile(file, metadata);
	}

	private async get(uuid: string): Promise<Either<NodeNotFoundError, ExtFn>> {
		const [nodeError, fileOrError] = await Promise.all([
			this.nodeService.get(uuid),
			this.nodeService.export(uuid),
		]);

		if (fileOrError.isLeft()) {
			return left(fileOrError.value);
		}

		if (nodeError.isLeft()) {
			return left(nodeError.value);
		}

		if (nodeError.value.parent !== Node.EXT_FOLDER_UUID) {
			return left(new NodeNotFoundError(uuid));
		}

		const file = fileOrError.value;

		const module = await import(URL.createObjectURL(file));

		return right(module.default);
	}

	async run(
		uuid: string,
		request: Request,
	): Promise<Either<NodeNotFoundError | Error, Response>> {
		const extOrErr = await this.get(uuid);

		if (extOrErr.isLeft()) {
			return left(extOrErr.value);
		}

		const resp = await extOrErr.value(request, this.nodeService);

		return right(resp);
	}
}
