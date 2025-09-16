import { AspectProperties } from "domain/aspects/aspect_node.ts";
import { type Permissions } from "domain/nodes/node.ts";
import { type NodeFilters } from "domain/nodes/node_filter.ts";
import { type NodeProperties } from "domain/nodes/node_properties.ts";

import { FeatureParameter } from "domain/features/feature_node.ts";

export interface NodeMetadata {
  uuid: string;
  fid: string;
  title: string;
  description: string;
  mimetype: string;
  size: number;
  parent: string;
  createdTime: string;
  modifiedTime: string;
  owner: string;
  aspects: string[];
  tags: string[];
  related: string[];
  properties: NodeProperties | AspectProperties;
  fulltext: string;

  filters: NodeFilters;

  group: string;
  groups: string[];
  email: string;
  secret: string;

  onCreate: string[];
  onUpdate: string[];
  permissions: Permissions;

  runManually: boolean;
  runAs?: string;
  parameters: FeatureParameter[];
  returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  returnDescription: string | undefined | null;
  returnContentType: string | undefined | null;

  groupsAllowed: string[];

  runOnCreates: boolean;
  runOnUpdates: boolean;

  exposeAction: boolean;
  exposeExtension: boolean;
  exposeAITool: boolean;
}
