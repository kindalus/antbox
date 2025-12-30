import type { FolderNode } from "domain/nodes/folder_node.ts";
import { type Permission } from "domain/nodes/node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { Either, left, right } from "shared/either.ts";
import { ForbiddenError, UnauthorizedError } from "shared/antbox_error.ts";
import type { NodeFilter, NodeFilters2D } from "domain/nodes/node_filter.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Logger } from "shared/logger.ts";

/**
 * Service responsible for handling all authorization and permission-related operations.
 *
 * This service centralizes permission checking logic and provides methods for:
 * - Checking if a principal is allowed to perform operations on folders
 * - Adding permission filters to node queries
 * - Resolving permission-based filters for authenticated and anonymous users
 */
export class AuthorizationService {
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
	 */
	isPrincipalAllowedTo(
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

		if (this.#isAnonymousAllowedTo(folder, permission)) {
			return right(true);
		}

		if (Users.ANONYMOUS_USER_EMAIL === ctx.principal.email) {
			return left(new UnauthorizedError());
		}

		if (
			this.#isOwner(ctx, folder) ||
			this.#isAuthenticatedAllowedTo(folder, permission) ||
			this.#isGroupAllowedTo(ctx, folder, permission)
		) {
			return right(true);
		}

		return left(new ForbiddenError());
	}

	/**
	 * Returns a reducer function that adds permission filters to node queries.
	 *
	 * If the principal is an admin, no additional filters are added.
	 * Otherwise, permission filters are added based on the user's authentication context.
	 *
	 * @param ctx - Authentication context
	 * @param permission - Permission to check for
	 * @returns A reducer function that adds permission filters
	 */
	toFiltersWithPermissionsResolved(
		ctx: AuthenticationContext,
		permission: Permission,
	): (acc: NodeFilters2D, cur: NodeFilters2D[0]) => NodeFilters2D {
		if (
			ctx.principal.groups.includes(Groups.ADMINS_GROUP_UUID)
		) {
			return (acc: NodeFilters2D, cur: NodeFilters2D[0]) => {
				acc.push(cur);
				return acc;
			};
		}

		const permissionFilters: NodeFilters2D = [];
		this.#addAnonymousPermissionFilters(permissionFilters, permission);

		if (ctx.principal.email !== Users.ANONYMOUS_USER_EMAIL) {
			this.#addAuthenticatedPermissionFilters(
				ctx,
				permissionFilters,
				permission,
			);
		}

		return (acc: NodeFilters2D, cur: NodeFilters2D[0]) => {
			for (const j of permissionFilters) {
				acc.push([...cur, ...j]);
			}

			return acc;
		};
	}

	/**
	 * Checks if the principal is the owner of the folder.
	 * Owners have implicit full access to their folders.
	 */
	#isOwner(ctx: AuthenticationContext, folder: FolderNode): boolean {
		return folder.owner === ctx.principal.email;
	}

	/**
	 * Checks if anonymous users are allowed to perform the specified permission.
	 * Anonymous permissions apply to all users, even unauthenticated ones.
	 */
	#isAnonymousAllowedTo(
		folder: FolderNode,
		permission: Permission,
	): boolean {
		return folder.permissions.anonymous.includes(permission);
	}

	/**
	 * Checks if any authenticated user is allowed to perform the specified permission.
	 * This applies to all logged-in users regardless of their group membership.
	 */
	#isAuthenticatedAllowedTo(
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
	 */
	#isGroupAllowedTo(
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

		for (const [group, permissions] of Object.entries(folder.permissions.advanced ?? {})) {
			if (
				permissions.includes(permission) && ctx.principal.groups.includes(group)
			) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Adds anonymous permission filters to the provided filters array.
	 */
	#addAnonymousPermissionFilters(f: NodeFilters2D, p: Permission) {
		this.#addPermissionFilters(f, [["permissions.anonymous", "contains", p]]);
	}

	/**
	 * Adds authenticated user permission filters to the provided filters array.
	 * This includes owner checks, authenticated permissions, group permissions, and advanced group permissions.
	 */
	#addAuthenticatedPermissionFilters(
		ctx: AuthenticationContext,
		f: NodeFilters2D,
		p: Permission,
	) {
		this.#addPermissionFilters(f, [[
			"permissions.authenticated",
			"contains",
			p,
		]]);
		this.#addPermissionFilters(f, [["owner", "==", ctx.principal.email]]);
		this.#addPermissionFilters(f, [
			["group", "==", ctx.principal.groups[0]],
			["permissions.group", "contains", p],
		]);

		ctx.principal.groups.forEach((g) => {
			this.#addPermissionFilters(f, [[
				`permissions.advanced.${g}`,
				"contains",
				p,
			]]);
		});
	}

	/**
	 * Adds permission filters to the filters array.
	 * Creates separate filter groups for folders and non-folders (with parent folder permissions).
	 */
	#addPermissionFilters(f: NodeFilters2D, filters: NodeFilter[]) {
		f.push([...filters, ["mimetype", "==", Nodes.FOLDER_MIMETYPE]]);

		f.push([
			...filters.map((
				[field, operator, value],
			): NodeFilter => [`@${field}`, operator, value]),
			["mimetype", "!=", Nodes.FOLDER_MIMETYPE],
		]);
	}
}
