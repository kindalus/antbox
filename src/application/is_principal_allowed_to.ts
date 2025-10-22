import type { FolderNode } from "domain/nodes/folder_node.ts";
import type { Permission } from "domain/nodes/node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { Either, left, right } from "shared/either.ts";
import { ForbiddenError, UnauthorizedError } from "shared/antbox_error.ts";

export function isPrincipalAllowedTo(
	ctx: AuthenticationContext,
	folder: FolderNode,
	permission: Permission,
): Either<UnauthorizedError | ForbiddenError, true> {
	if (
		ctx.principal.email === Users.ROOT_USER_EMAIL ||
		ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
	) {
		return right(true);
	}

	if (isAnonymousAllowedTo(folder, permission)) {
		return right(true);
	}

	if (Users.ANONYMOUS_USER_EMAIL === ctx.principal.email) {
		return left(new UnauthorizedError());
	}

	if (
		isOwner(ctx, folder) ||
		isAuthenticatedAllowedTo(folder, permission) ||
		isGroupAllowedTo(ctx, folder, permission)
	) {
		return right(true);
	}

	return left(new ForbiddenError());
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
