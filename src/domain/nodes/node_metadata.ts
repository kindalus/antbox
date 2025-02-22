import { type AspectProperty } from "domain/aspects/aspect.ts";
import { type Permissions } from "./node.ts";
import { type NodeFilter } from "./node_filter.ts";
import { type NodeProperties } from "./node_properties.ts";
import { type Aggregation } from "./smart_folder_node.ts";

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
  properties: NodeProperties | AspectProperty[];
  fulltext: string;

  filters: NodeFilter[];
  aggregations: Aggregation[];

  group: string;
  groups: string[];
  email: string;
  secret: string;

  onCreate: string[];
  onUpdate: string[];
  childFilters: NodeFilter[];
  permissions: Permissions;

  runManually: boolean;
  runAs?: string;
  params: string[];
  groupsAllowed: string[];

  runOnCreates: boolean;
  runOnUpdates: boolean;

  targetAspect: string;
  height: number;
  width: number;
}
