import { FeatureDTO } from "application/feature_dto.ts";

/**
 * Built-in Node Service tools (always available when useTools: true)
 * These tools provide agents with access to the core Antbox node operations
 */
export const BUILTIN_AGENT_TOOLS: Partial<FeatureDTO>[] = [
	{
		id: "builtin:node-service:find",
		name: "find",
		description: "Search nodes using NodeFilter queries",
		parameters: [
			{
				name: "filters",
				type: "array",
				required: true,
				description: "Array of NodeFilter tuples [field, operator, value]",
				arrayType: "object",
			},
		],
		returnType: "array",
		returnDescription: "Array of matching nodes",
	},
	{
		id: "builtin:node-service:get",
		name: "get",
		description: "Retrieve a specific node by UUID",
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description: "UUID of the node to retrieve",
			},
		],
		returnType: "object",
		returnDescription: "Node metadata and content",
	},
	{
		id: "builtin:node-service:export",
		name: "export",
		description: "Export node content as file",
		parameters: [
			{
				name: "uuid",
				type: "string",
				required: true,
				description: "UUID of the node to export",
			},
		],
		returnType: "file",
		returnDescription: "Node file content",
	},
	{
		id: "builtin:ai-model:ocr",
		name: "ocr",
		description:
			"Extract text from images and documents using OCR (Optical Character Recognition)",
		parameters: [
			{
				name: "file",
				type: "file",
				required: true,
				description: "Image or document file to extract text from",
			},
		],
		returnType: "string",
		returnDescription: "Extracted text content from the file",
	},
];
