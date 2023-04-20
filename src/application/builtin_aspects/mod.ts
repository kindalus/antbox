import { Aspect } from "/domain/aspects/aspect.ts";
import { GroupAspect } from "./group.ts";
import { UserAspect } from "./user.ts";
import { WebContentAspect } from "./web_content.ts";

export const builtinAspects: Aspect[] = [
	WebContentAspect,
	GroupAspect,
	UserAspect,
];
