export interface Aspect {
	uuid: string;
	title: string;
	description: string;
	builtIn: boolean;
	mimetypeConstraints: string[];
	properties: AspectProperty[];
}

export interface AspectProperty {
	/**
	 * regex /[a-zA-Z_][_a-zA-Z0-9_]{2,}/;
	 */
	name: string;
	title: string;
	type: PropertyType;

	/**
	 * Opcional
	 */
	validationRegex?: string;

	/**
	 * Opcional
	 */
	validationList?: string[];

	required: boolean;

	default?: unknown;
}

export type PropertyType =
	| "String"
	| "Number"
	| "DateTime"
	| "Boolean"
	| "UUID"
	| "String[]"
	| "Number[]"
	| "UUID[]";
