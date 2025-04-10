import { ExtNode } from "domain/exts/ext_node";
import type { AntboxError } from "shared/antbox_error";
import type { Either } from "shared/either";
import type { AuthenticationContext } from "./authentication_context";
import type { NodeProperties } from "domain/nodes/node_properties";
import type { AspectProperty } from "domain/aspects/aspect_node";


export interface ExtDTO {
  uuid: string;
  title: string;
  description: string;
  mimetype?: string;
  size: Number;
  aspects?: string[];
  properties?: NodeProperties | AspectProperty[]; 
}

export function extToNode(metadata: Partial<ExtNode>): ExtDTO {
  return {
    uuid: metadata.uuid!,
    title: metadata.title!,
    description: metadata.description!,
    mimetype: metadata.mimetype!,
    size: metadata.size!,
    aspects: metadata.aspects,
    properties: metadata.properties,
  };
}

export function nodeToExt(
  ctx: AuthenticationContext,
  file: File,
  metadata: Partial<ExtDTO>
): Either<AntboxError, ExtNode> {
  const uuid = metadata.uuid ?? file.name?.split(".")[0].trim();

  return ExtNode.create({
    uuid: uuid,
    fid: uuid,
    title: metadata.title,
    description: metadata.description,
    owner: ctx.principal.email,
    aspects: metadata.aspects,
    properties: metadata.properties,
  });
}
