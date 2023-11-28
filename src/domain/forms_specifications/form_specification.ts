import { PropertyType } from "../aspects/aspect.ts";

export interface FormSpecification {
	uuid: string;
	title: string;
	description?: string;
	builtIn: boolean;
	targetAspect: string;
	sourceImageUrl?: string;
	properties: FormPropertySpecification[];
	viewport: Viewport;
}

export interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
	page: 1 | number;
}

export interface FormPropertySpecification {
	name: string;
	type: PropertyType;
	viewport: Viewport;
}
