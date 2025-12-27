import type { AuthenticationContext } from "./authentication_context.ts";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";

/**
 * Creates an elevated authentication context for system-level operations.
 * This context has admin privileges and bypasses normal permission checks.
 * 
 * Use this sparingly and only for:
 * - Internal system operations
 * - Event handlers that need to operate regardless of user permissions
 * - Background tasks
 * 
 * @param tenant - The tenant name (defaults to "default")
 * @returns An authentication context with admin privileges
 */
export function createElevatedContext(tenant = "default"): AuthenticationContext {
	return {
		mode: "Action",
		principal: {
			email: Users.ROOT_USER_EMAIL,
			groups: [Groups.ADMINS_GROUP_UUID],
		},
		tenant,
	};
}
