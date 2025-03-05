import type { AspectProperties } from "domain/aspects/aspect";
import { AspectNode } from "domain/aspects/aspect_node";
import type { NodeFilters } from "domain/nodes/node_filter";
import { builtinAspects } from "./builtin_aspects/mod";

export interface AspectDTO {
  uuid: string;
  title: string;
  description?: string;
  builtIn: boolean;
  filters: NodeFilters;
  properties: AspectProperties;
}

export function nodeToAspect(aspect: AspectNode): AspectDTO {
  return {
    uuid: aspect.uuid,
    title: aspect.title,
    description: aspect.description,
    builtIn: builtinAspects.find((a) => a.uuid === aspect.uuid) !== undefined,
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
