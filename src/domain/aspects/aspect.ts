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
  validationList?: string;

  /**
   * Opcional - Lista de UUIDS de um detrminado aspecto
   * Utilizado quando a propriedade é validada através dos nós de um aspecto
   * O tipo da propriedade deve ser UUID ou UUID[]
   */
  validationLookup?: string[];

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
