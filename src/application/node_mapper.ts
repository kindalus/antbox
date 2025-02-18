import { FormSpecificationNode } from "../domain/forms_specifications/form_specification.ts";

export function fileToFormSpecification(file: File): Promise<FormSpecificationNode> {
	return file
		.text()
		.then((text) => JSON.parse(text))
		.then((raw) =>
			FormSpecificationNode.create({
				uuid: raw.uuid ?? file.name.split(".")[0],
				title: raw.title ?? file.name.split(".")[0],
				description: raw.description ?? "",
				width: raw.width ?? 595,
				height: raw.height ?? 842,
				targetAspect: raw.targetAspect,
				properties: raw.properties ?? [],
			}).value as FormSpecificationNode
		);
}
