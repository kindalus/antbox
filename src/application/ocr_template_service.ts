import { Node } from "../domain/nodes/node.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { OcrTemplate } from "../domain/orc_templates/ocr_template.ts";
import { AntboxError, BadRequestError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { fileToOcrTemplate } from "./node_mapper.ts";
import { NodeService } from "./node_service.ts";

export class OcrTemplateService {
	constructor(private readonly nodeService: NodeService) {}

	async createOrReplace(
		file: File,
		_metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (file.type !== Node.OCR_TEMPLATE_MIMETYPE) {
			return left(new BadRequestError(`Invalid file type ${file.type}`));
		}

		const template = (await file.text().then((t) => JSON.parse(t))) as OcrTemplate;

		const metadata = NodeFactory.createFileMetadata(
			template.uuid,
			template.uuid,
			{
				title: template.title,
				description: template.description,
				parent: Node.OCR_TEMPLATES_FOLDER_UUID,
			},
			Node.OCR_TEMPLATE_MIMETYPE,
			file.size,
		);

		return this.nodeService.createFile(file, metadata);
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, OcrTemplate>> {
		const nodePromise = this.nodeService.get(uuid);
		const OcrTemplatePromise = this.nodeService.export(uuid);

		const [nodeOrErr, OcrTemplateOrErr] = await Promise.all([
			nodePromise,
			OcrTemplatePromise,
		]);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (OcrTemplateOrErr.isLeft()) {
			return left(OcrTemplateOrErr.value);
		}

		if (nodeOrErr.value.parent !== Node.OCR_TEMPLATES_FOLDER_UUID) {
			return left(new NodeNotFoundError(uuid));
		}

		const OcrTemplate = await fileToOcrTemplate(OcrTemplateOrErr.value);

		return right(OcrTemplate);
	}

	async list(): Promise<OcrTemplate[]> {
		const nodesOrErrs = await this.nodeService.list(Node.OCR_TEMPLATES_FOLDER_UUID);
		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const OcrTemplatesPromises = nodesOrErrs.value.map((n) => this.get(n.uuid));

		const OcrTemplatesOrErrs = await Promise.all(OcrTemplatesPromises);
		const errs = OcrTemplatesOrErrs.filter((a) => a.isLeft());
		const OcrTemplates = OcrTemplatesOrErrs.filter((a) => a.isRight()).map((a) =>
			a.value! as OcrTemplate
		);

		if (errs.length > 0) {
			errs.forEach((e) => console.error(e.value));
		}

		return OcrTemplates;
	}
}
