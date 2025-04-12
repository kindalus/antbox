import {
  AspectNode,
  type AspectProperties,
} from "domain/aspects/aspect_node.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";

export interface AspectDTO {
  uuid: string;
  title: string;
  description?: string;
  filters: NodeFilters;
  properties: AspectProperties;
}

export function nodeToAspect(aspect: AspectNode): AspectDTO {
  return {
    uuid: aspect.uuid,
    title: aspect.title,
    description: aspect.description,
    filters: aspect.filters,
    properties: aspect.properties,
  };
}

export function aspectToNode(aspect: AspectDTO): AspectNode {
  return AspectNode.create({
    uuid: aspect.uuid,
    title: aspect.title,
    description: aspect.description,
    filters: aspect.filters,
    properties: aspect.properties,
  }).right;
}
