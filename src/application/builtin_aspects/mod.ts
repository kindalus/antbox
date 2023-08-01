import { Aspect } from "../../domain/aspects/aspect.ts";
import { WebContentAspect } from "./web_content.ts";

export const builtinAspects: Aspect[] = [
	WebContentAspect,
];
