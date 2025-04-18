import type { FolderNode } from "domain/nodes/folder_node.ts";
import type { Permission } from "domain/nodes/node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";

export function isPrincipalAllowedTo(
  ctx: AuthenticationContext,
  folder: FolderNode,
  permission: Permission,
): boolean {
  if (
    ctx.principal.email === Users.ROOT_USER_EMAIL ||
    ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
  ) {
    return true;
  }

  if (isAnonymousAllowedTo(folder, permission)) {
    return true;
  }

  if (Users.ANONYMOUS_USER_EMAIL === ctx.principal.email) {
    return false;
  }

  if (
    isOwner(ctx, folder) ||
    isAuthenticatedAllowedTo(folder, permission) ||
    isGroupAllowedTo(ctx, folder, permission)
  ) {
    return true;
  }

  return false;
}

function isOwner(ctx: AuthenticationContext, folder: FolderNode): boolean {
  return folder.owner === ctx.principal.email;
}

function isAnonymousAllowedTo(
  folder: FolderNode,
  permission: Permission,
): boolean {
  return folder.permissions.anonymous.includes(permission);
}

function isAuthenticatedAllowedTo(
  folder: FolderNode,
  permission: Permission,
): boolean {
  return folder.permissions.authenticated.includes(permission);
}

function isGroupAllowedTo(
  ctx: AuthenticationContext,
  folder: FolderNode,
  permission: Permission,
): boolean {
  if (!ctx.principal.groups.includes(folder.group)) {
    return false;
  }

  if (folder.permissions.group.includes(permission)) {
    return true;
  }

  Object.entries(folder.permissions.advanced ?? []).forEach(
    ([group, permissions]) => {
      if (
        permissions.includes(permission) && ctx.principal.groups.includes(group)
      ) {
        return true;
      }
    },
  );

  return false;
}
