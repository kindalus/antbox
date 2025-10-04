import { AntboxError } from "shared/antbox_error.ts";

export class AgentNotFoundError extends AntboxError {
	constructor(uuid: string) {
		super("AgentNotFoundError", `Agent with uuid ${uuid} not found`);
	}
}
