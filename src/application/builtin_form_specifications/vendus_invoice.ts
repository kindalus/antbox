import { FormSpecificationNode } from "../../domain/forms_specifications/form_specification.ts";
import { Node } from "../../domain/nodes/node.ts";
import { NodeFactory } from "../../domain/nodes/node_factory.ts";

export const VendusInvoiceFormSpecification = NodeFactory.compose({
	mimetype: Node.FORM_SPECIFICATION_MIMETYPE,
	uuid: "spec-factura-vendus",
	fid: "spec-factura-vendus",
}, {
	builtIn: true,
	targetAspect: "factura-vendus",
	width: 2480,
	height: 3508,

	formProperties: [{
		name: "number",
		type: "string",
		viewport: {
			x: 440,
			y: 880,
			width: 360,
			height: 70,
		},
	}, {
		name: "date",
		type: "date",
		viewport: {
			x: 200,
			y: 1055,
			width: 190,
			height: 50,
		},
	}, {
		name: "due-date",
		type: "date",
		viewport: {
			x:630,
			y: 1055,
			width: 190,
			height: 50,
		},
	}, {
		name: "customer-tax-id",
		type: "string",
		viewport: {
			x: 1070,
			y: 1055,
			width: 220,
			height: 50,
		},
	}, {
		name: "amount",
		type: "number",
		viewport: {
			x: 1990,
			y: 3022,
			width: 245,
			height: 60,
		},
		formats: ["/\.//g", "/,/./"],
	}],
} as FormSpecificationNode);
