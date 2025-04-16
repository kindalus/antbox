import { ExtNode } from "domain/exts/ext_node.ts";

export interface ExtDTO {
  uuid: string;
  title: string;
  size: number;
  description?: string;
}

export function extNodeToDto(metadata: ExtNode): ExtDTO {
  return {
    uuid: metadata.uuid,
    title: metadata.title,
    size: metadata.size,
    description: metadata.description,
  };
}
