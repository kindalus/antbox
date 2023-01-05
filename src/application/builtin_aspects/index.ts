import { Aspect } from "/domain/aspects/aspect.ts";
import { WebContentAspect } from "./web_content.ts";
import { UserAspect } from "./user.ts";
import { GroupAspect } from "./group.ts";

export const builtinAspects: Aspect[] = [
  WebContentAspect,
  GroupAspect,
  UserAspect,
];
