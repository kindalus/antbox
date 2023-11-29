import { UserNode } from "../nodes/user_node.ts";

export interface AuthContextProvider {
	readonly principal: UserNode;
	readonly mode: "Direct" | "Action";
}

export class UnAuthenticatedError extends Error {
	constructor() {
		super("Unauthenticated");
	}
}
