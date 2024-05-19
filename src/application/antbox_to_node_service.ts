import { AspectNode } from "../domain/aspects/aspect_node.ts";
import { AuthContextProvider } from "../domain/auth/auth_provider.ts";
import { AggregationFormulaError } from "../domain/nodes/aggregation_formula_error.ts";
import { FolderNode } from "../domain/nodes/folder_node.ts";
import { FolderNotFoundError } from "../domain/nodes/folder_not_found_error.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeFilter } from "../domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { NodeFilterResult } from "../domain/nodes/node_repository.ts";
import { SmartFolderNodeEvaluation } from "../domain/nodes/smart_folder_evaluation.ts";
import { SmartFolderNodeNotFoundError } from "../domain/nodes/smart_folder_node_not_found_error.ts";
import { AntboxError } from "../shared/antbox_error.ts";
import { Either } from "../shared/either.ts";
import { AntboxService } from "./antbox_service.ts";
import { NodeService } from "./node_service.ts";
import { NodeServiceContext } from "./node_service_context.ts";

export function antboxToNodeService(
	auth: AuthContextProvider,
	srv: AntboxService,
): NodeService {
	return new SecuredNodeService(auth, srv);
}

class SecuredNodeService extends NodeService {
	constructor(
		private auth: AuthContextProvider,
		private readonly srv: AntboxService,
	) {
		super({} as NodeServiceContext);
	}

	createFile(
		file: File,
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		return this.srv.createFile(this.auth, file, metadata);
	}

	create(
		metadata: Partial<FolderNode>,
	): Promise<Either<AntboxError, Node>> {
		return this.srv.create(this.auth, metadata);
	}

	createMetanode(metadata: Partial<Node>): Promise<Either<AntboxError, Node>> {
		return this.srv.create(this.auth, metadata);
	}

	duplicate(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
		return this.srv.duplicate(this.auth, uuid);
	}

	copy(uuid: string, parent: string): Promise<Either<NodeNotFoundError, Node>> {
		return this.srv.copy(this.auth, uuid, parent);
	}

	updateFile(
		uuid: string,
		file: File,
	): Promise<Either<NodeNotFoundError, void>> {
		return this.srv.updateFile(this.auth, uuid, file);
	}

	delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		return this.srv.delete(this.auth, uuid);
	}

	get(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
		return this.srv.get(this.auth, uuid);
	}

	getAspect(uuid: string): Promise<Either<NodeNotFoundError, AspectNode>> {
		return this.srv.getAspect(this.auth, uuid);
	}

	list(
		parent?: string | undefined,
	): Promise<Either<FolderNotFoundError, Node[]>> {
		return this.srv.list(this.auth, parent);
	}

	listAspects(): Promise<Either<AntboxError, AspectNode[]>> {
		return this.srv.listAspects(this.auth);
	}

	find(
		filters: NodeFilter[],
		pageSize: number,
		pageToken: number,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		return this.srv.find(this.auth, filters, pageSize, pageToken);
	}

	update(
		uuid: string,
		data: Partial<Node>,
		merge?: boolean | undefined,
	): Promise<Either<NodeNotFoundError, void>> {
		return this.srv.update(this.auth, uuid, data, merge);
	}

	evaluate(
		uuid: string,
	): Promise<
		Either<
			SmartFolderNodeNotFoundError | AggregationFormulaError,
			SmartFolderNodeEvaluation
		>
	> {
		return this.srv.evaluate(this.auth, uuid);
	}

	export(uuid: string): Promise<Either<NodeNotFoundError, File>> {
		return this.srv.export(this.auth, uuid);
	}
}
