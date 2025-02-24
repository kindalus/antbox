import { type Aspect } from "domain/aspects/aspect.ts";
import { WebContentAspect } from "./web_content_aspect.ts";

export const builtinAspects: Aspect[] = [WebContentAspect];
