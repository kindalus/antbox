import { FormSpecificationNode } from "../domain/forms_specifications/form_specification.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";

import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { fileToFormSpecification } from "./node_mapper.ts";
import { NodeService } from "./node_service.ts";

export class FormSpecificationService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		file: File,
		_metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (file.type !== Node.FORM_SPECIFICATION_MIMETYPE) {
			return left(new BadRequestError(`Invalid file type ${file.type}`));
		}

		const template = (await file.text().then((t) => JSON.parse(t))) as FormSpecificationNode;

		const metadata = NodeFactory.createMetadata(
			template.uuid,
			template.uuid,
			Node.FORM_SPECIFICATION_MIMETYPE,
			file.size,
			{
				title: template.title,
				description: template.description,
				parent: Folders.FORMS_SPECIFICATIONS_FOLDER_UUID,
			},
		);

		return this.nodeService.createFile(file, metadata);
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, FormSpecificationNode>> {
		const nodePromise = this.nodeService.get(uuid);
		const FormSpecificationPromise = this.nodeService.export(uuid);

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

	async list(): Promise<FormSpecificationNode[]> {
		const Folders.rErrs = await this.nodeService.list(Folders.FORMS_SPECIFICATIONS_FOLDER_UUID);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const FormSpecificationsPromises = nodesOrErrs.value.map((n) => this.get(n.uuid));

		const FormSpecificationsOrErrs = await Promise.all(FormSpecificationsPromises);
		const errs = FormSpecificationsOrErrs.filter((a) => a.isLeft());
		const FormSpecifications = FormSpecificationsOrErrs.filter((a) => a.isRight()).map((a) =>
			a.value! as FormSpecificationNode
		);

		if (errs.length > 0) {
			errs.forEach((e) => console.error(e.value));
		}

		return FormSpecifications;
	}
}
