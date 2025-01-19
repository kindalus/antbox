import { AuthContextProvider } from "../domain/auth/auth_provider.ts";
import { UserNode } from "../domain/nodes/user_node.ts";

// Change AuthenticationContextProvider to AuthenticationContext
export function getAuthenticationContext(req: Request): AuthContextProvider {
	const principalHeader = req.headers.get("X-Principal");

	return {
		principal: principalHeader
			? JSON.parse(principalHeader)
			: { email: UserNode.ANONYMOUS_USER_EMAIL, groups: [] },
		tenant: req.headers.get("X-Tenant") ?? "default",
		mode: "Direct",
	} as unknown as AuthContextProvider;
}
