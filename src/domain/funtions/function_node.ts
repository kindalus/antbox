import { ActionMixin } from "domain/nodes/action_mixin.ts";
import { FileMixin } from "domain/nodes/file_mixin.ts";
import { Node } from "domain/nodes/node.ts";
import { NodeFilter, NodeFilters } from "domain/nodes/node_filter.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Folders } from "domain/nodes/folders.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

export class FunctionNode extends ActionMixin(FileMixin(Node)) {
  #parameters: FunctionParameter[];
  #exposeAction: boolean;
  #exposeExtension: boolean;
  #exposeMCP: boolean;
  #groupsAllowed: string[];
  #runAs: string | undefined | null;

  #runOnCreates: boolean;
  #runOnUpdates: boolean;
  #runManually: boolean;
  #filters: NodeFilters;

  private constructor(metadata: Partial<NodeMetadata> = {}) {
    super({
      ...metadata,
      mimetype: Nodes.FUNCTION_MIMETYPE,
      parent: Folders.FUNCTIONS_FOLDER_UUID,
    });

    this.#parameters = metadata.parameters || [];
    this.#exposeAction = metadata.exposeAction || false;
    this.#exposeExtension = metadata.exposeExtension || false;
    this.#exposeMCP = metadata.exposeMCP || false;
    this.#groupsAllowed = metadata.groupsAllowed || [];
    this.#runAs = metadata.runAs || null;

    // Action related
    this.#runOnCreates = metadata.runOnCreates || false;
    this.#runOnUpdates = metadata.runOnUpdates || false;
    this.#runManually = metadata.runManually || false;
    this.#filters = metadata.filters || [];
  }
}

export interface FunctionParameter {
  name: string;
  description: string;
  type: "string" | "number" | "boolean" | "array" | "object" | "file";
  contentType: "text/plain" | string | undefined | null;
  required: boolean;
}

export interface Action {
  uuid: string;
  title: string;
  description: string;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  parameters: FunctionParameter[];
  filters: NodeFilter[];
  groupsAllowed: string[];
  runAs?: string;
}

export interface Extension {
  uuid: string;
  title: string;
  description: string;
  parameters: FunctionParameter[];
  groupsAllowed: string[];
  runAs?: string;
}
