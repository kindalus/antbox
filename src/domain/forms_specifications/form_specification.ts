import { PropertyType } from "../aspects/aspect.ts";
import { Node } from "../nodes/node.ts";

export class FormSpecificationNode extends Node {
	builtIn: boolean;
	targetAspect: string;
	formProperties: FormPropertySpecification[];
	height: number;
    width: number;
     

    constructor() {

         super();

         this.mimetype = Node.FORM_SPECIFICATION_MIMETYPE;

         this.targetAspect = "";
         this.formProperties = [];

         this.builtIn = false;
         
         this.height = 0;
         this.width = 0;

    }

}

export interface Viewport {
	x: number;
	y: number;
	width: number;
	height: number;
	page: 1 | number;
}

export interface FormPropertySpecification {
	name: string
	type: PropertyType;
	viewport: Viewport;
    formats?: string[];
}

