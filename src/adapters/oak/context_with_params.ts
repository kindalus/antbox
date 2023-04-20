import { Context } from "../../../deps.ts";

export type ContextWithParams = Context & {
  params: Record<string, string>;
};
