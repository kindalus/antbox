import { UserNode } from "domain/users_groups/user_node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { log } from "node:console";

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
    group: metadata.group,
    groups: Array.from(groups),
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
