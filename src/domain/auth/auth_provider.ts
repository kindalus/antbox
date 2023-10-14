import { User } from "./user.ts";

export interface AuthContextProvider {
	readonly principal: User;
	readonly mode: "Direct" | "Action";
}

export class UnAuthenticatedError extends Error {
	constructor() {
		super("Unauthenticated");
	}
}
