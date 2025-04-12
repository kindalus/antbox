import { AspectProperties } from "domain/aspects/aspect_node.ts";
import { type Permissions } from "./node.ts";
import { type NodeFilters } from "./node_filter.ts";
import { type NodeProperties } from "./node_properties.ts";

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
  params: string[];
  groupsAllowed: string[];

  runOnCreates: boolean;
  runOnUpdates: boolean;
}
