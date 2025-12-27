import type { NodeFilters } from "domain/nodes/node_filter.ts";

/**
 * AspectProperty - Property definition for an aspect
 */
export interface AspectProperty {
	/**
	 * Property name - regex /[a-zA-Z_][_a-zA-Z0-9_]{2,}/
	 */
	name: string;
	title: string;
	type: "uuid" | "string" | "number" | "boolean" | "object" | "array" | "file";
	arrayType?: "string" | "number" | "uuid";
	contentType?: string;
	readonly?: boolean;
	searchable?: boolean;
	validationRegex?: string;
	validationList?: string[];
	validationFilters?: NodeFilters;
	required?: boolean;
	defaultValue?: string | number | boolean;
}

/**
 * AspectData - Immutable configuration data for aspects
 * Aspects define metadata schemas for nodes
 *
 * Note: Aspects can be updated (filters and properties can change)
 */
export interface AspectData {
	readonly uuid: string;
	readonly title: string;
	readonly description?: string;
	readonly filters: NodeFilters;
	readonly properties: AspectProperty[];
	readonly createdTime: string;
	readonly modifiedTime: string;
}
