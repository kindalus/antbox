import { FormSpecificationNode } from "../domain/forms_specifications/form_specification.ts";
import { Folders } from "../domain/nodes/folders.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { Nodes } from "../domain/nodes/nodes.ts";

import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { AuthenticationContext } from "./authentication_context.ts";
import { fileToFormSpecification } from "./node_mapper.ts";
import { NodeService } from "./node_service.ts";

export class FormSpecificationService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		file: File,
		_metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (file.type !== Nodes.FORM_SPECIFICATION_MIMETYPE) {
			return left(new BadRequestError(`Invalid file type ${file.type}`));
		}

		const template = (await file.text().then((t) => JSON.parse(t))) as FormSpecificationNode;

		const noderOrErr = await FormSpecificationNode.create({
			...template,
			fid: template.uuid,
			size: file.size,
		});
		if (noderOrErr.isLeft()) {
			return left(noderOrErr.value);
		}

		return this.nodeService.createFile(file, metadata);
	}

	async get(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<NodeNotFoundError, FormSpecificationNode>> {
		const nodePromise = this.nodeService.get(ctx, uuid);
		const FormSpecificationPromise = this.nodeService.export(ctx, uuid);

		const [nodeOrErr, FormSpecificationOrErr] = await Promise.all([
			nodePromise,
			FormSpecificationPromise,
		]);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (FormSpecificationOrErr.isLeft()) {
			return left(FormSpecificationOrErr.value);
		}

		if (nodeOrErr.value.parent !== Folders.FORMS_SPECIFICATIONS_FOLDER_UUID) {
			return left(new NodeNotFoundError(uuid));
		}

		const FormSpecification = await fileToFormSpecification(FormSpecificationOrErr.value);

		return right(FormSpecification);
	}

	async list(ctx: AuthenticationContext): Promise<FormSpecificationNode[]> {
		const nodesOrErrs = await this.nodeService.list(
			ctx,
			Folders.FORMS_SPECIFICATIONS_FOLDER_UUID,
		);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const batch = nodesOrErrs.value.map((n) => this.get(n.uuid));

		const formSpecificationsOrErrs = await Promise.all(batch);
		const errs = formSpecificationsOrErrs.filter((a) => a.isLeft());
		const FormSpecifications = formSpecificationsOrErrs.filter((a) => a.isRight()).map((a) =>
			a.value! as FormSpecificationNode
		);

		if (errs.length > 0) {
			errs.forEach((e) => console.error(e.value));
		}

		return FormSpecifications;
	}
}
