import type { FolderNode } from "domain/nodes/folder_node.ts";
import type { Permission } from "domain/nodes/node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { Either, left, right } from "shared/either.ts";
import { ForbiddenError, UnauthorizedError } from "shared/antbox_error.ts";

// TODO: Extract this permission checking logic into a dedicated PermissionService
// This would improve:
// - Separation of concerns (permission logic separate from service operations)
// - Testability (easier to test permission rules in isolation)
// - Extensibility (easier to add new permission types/strategies)
// - Maintainability (centralized permission logic)
// Suggested structure:
//   - PermissionService class with methods like canRead(), canWrite(), canDelete()
//   - PermissionStrategy interface for different permission models
//   - PermissionPolicy classes for complex permission scenarios

/**
 * Checks if a principal (user) is allowed to perform a specific permission on a folder.
 *
 * This function implements a hierarchical permission check with the following priority:
 * 1. Root user and Admin group members have full access
 * 2. Anonymous users with matching permissions in the folder
 * 3. Anonymous users without permissions are denied
 * 4. Authenticated users are checked for:
 *    - Ownership of the folder
 *    - Authenticated user permissions
 *    - Group membership permissions (including advanced group permissions)
 *
 * @param ctx - The authentication context containing principal information
 * @param folder - The folder node to check permissions against
 * @param permission - The permission to check (e.g., "Read", "Write", "Delete")
 * @returns Either an error (Unauthorized/Forbidden) or true if allowed
 *
 * @example
 * ```typescript
 * const result = isPrincipalAllowedTo(ctx, folder, "Write");
 * if (result.isLeft()) {
 *   // Handle permission denied
 * }
 * ```
 */
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

/**
 * Checks if the principal is the owner of the folder.
 * Owners have implicit full access to their folders.
 */
function isOwner(ctx: AuthenticationContext, folder: FolderNode): boolean {
	return folder.owner === ctx.principal.email;
}

/**
 * Checks if anonymous users are allowed to perform the specified permission.
 * Anonymous permissions apply to all users, even unauthenticated ones.
 */
function isAnonymousAllowedTo(
	folder: FolderNode,
	permission: Permission,
): boolean {
	return folder.permissions.anonymous.includes(permission);
}

/**
 * Checks if any authenticated user is allowed to perform the specified permission.
 * This applies to all logged-in users regardless of their group membership.
 */
function isAuthenticatedAllowedTo(
	folder: FolderNode,
	permission: Permission,
): boolean {
	return folder.permissions.authenticated.includes(permission);
}

/**
 * Checks if the principal's group memberships grant the specified permission.
 *
 * This function checks:
 * 1. If the user belongs to the folder's primary group
 * 2. If the folder's group permissions include the requested permission
 * 3. If any advanced group permissions grant access
 *
 * Advanced permissions allow fine-grained control where specific groups
 * can have different permission sets on the same folder.
 *
 * Note: There's a potential bug in the forEach loop - it doesn't properly
 * return true when a match is found. Consider refactoring to use .some()
 */
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
