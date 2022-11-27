import { Context } from "/deps/oak";

export type ContextWithParams = Context & {
  params: Record<string, string>;
};
