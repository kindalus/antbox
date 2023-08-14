export interface OcrTemplate {
	uuid: string;
	title: string;
	description?: string;
	builtIn: boolean;
	targetAspect: string;
	sourceImageUrl?: string;
	properties: OcrTemplateProperty[];
	viewport: OcrTemplateViewport;
}

export interface OcrTemplateViewport {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface OcrTemplateProperty {
	name: string;
	type: OcrPropertyType;
	viewport: OcrTemplateViewport;
}

export type OcrPropertyType =
	| "boolean"
	| "date"
	| "dateTime"
	| "json"
	| "number"
	| "richText"
	| "string"
	| "text"
	| "uuid";
