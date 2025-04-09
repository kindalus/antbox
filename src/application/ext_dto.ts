import { ExtNode } from "domain/exts/ext_node";
import type { AntboxError } from "shared/antbox_error";
import type { Either } from "shared/either";
import type { AuthenticationContext } from "./authentication_context";


export interface ExtDTO {
  uuid: string;
  title: string;
  description: string;
  mimetype: string;
  size: Number;
}

export function extToNode(metadata: Partial<ExtNode>): ExtDTO {
  return {
    uuid: metadata.uuid!,
    title: metadata.title!,
    description: metadata.description!,
    mimetype: metadata.mimetype!,
    size: metadata.size!,
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
  });
}
