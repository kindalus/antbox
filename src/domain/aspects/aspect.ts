import { NodeFilter } from "../nodes/node_filter.ts";

export interface Aspect {
  uuid: string;
  title: string;
  description: string;
  builtIn: boolean;
  filters: NodeFilter[];
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

  /**
   * Opcional - Lista de UUIDS de um determinado aspecto
   * Utilizado quando a propriedade é validada através dos nós de um aspecto
   * O tipo da propriedade deve ser UUID ou UUID[]
   */
  validationFilters?: NodeFilter[];

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
