import { Context } from "../../../deps.ts";
import { Anonymous } from "../../application/builtin_users/anonymous.ts";
import { AuthContextProvider } from "../../domain/auth/auth_provider.ts";
import { User } from "../../domain/auth/user.ts";

export class OakAuthRequestProvider implements AuthContextProvider {
	constructor(private ctx: Context) {}

	get principal(): User {
		return this.ctx.state.user || Anonymous;
	}

	get mode(): "Direct" | "Action" {
		return "Direct";
	}
}
