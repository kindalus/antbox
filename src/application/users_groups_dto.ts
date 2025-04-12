import { UserNode } from "domain/users_groups/user_node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";

export interface UserDTO {
  uuid?: string;
  name: string;
  email: string;
  secret?: string;
  group: string;
  groups: string[];
}

export interface GroupDTO {
  uuid: string;
  title: string;
}

export function nodeToUser(metadata: UserNode): UserDTO {
  return {
    uuid: metadata.uuid,
    name: metadata.title,
    email: metadata.email,
    secret: metadata.secret,
    group: metadata.group,
    groups: [...metadata.groups],
  };
}

export function userToNode(
  ctx: AuthenticationContext,
  metadata: UserDTO,
): UserNode {
  const groups = new Set(metadata.groups ?? []);

  return UserNode.create({
    uuid: metadata.uuid,
    title: metadata.name,
    email: metadata.email,
    owner: ctx.principal.email,
    secret: metadata.secret,
    group: Array.from(groups)[0],
    groups: Array.from(groups).slice(1),
  }).right;
}

export function nodeToGroup(metadata: GroupDTO): GroupDTO {
  return {
    uuid: metadata.uuid,
    title: metadata.title,
  };
}

export function groupToNode(
  ctx: AuthenticationContext,
  metadata: GroupDTO,
): GroupNode {
  return GroupNode.create({
    uuid: metadata.uuid,
    title: metadata.title,
    owner: ctx.principal.email,
  }).right;
}
