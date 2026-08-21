import { z } from "zod";

export const ThinkingLevelSchema = z.enum([
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
]);

export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;
export type ModelSelection = readonly [model: string, thinkingLevel?: ThinkingLevel];

const ModelNameSchema = z.string().trim().min(1);
const ModelSelectionTupleSchema = z.union([
	z.tuple([ModelNameSchema]),
	z.tuple([ModelNameSchema, ThinkingLevelSchema]),
]);

/** Accepts legacy strings while returning the canonical tuple representation. */
export const ModelSelectionSchema = z.union([
	ModelNameSchema.transform((model): ModelSelection => [model]),
	ModelSelectionTupleSchema.transform((selection): ModelSelection => selection),
]);

export function modelName(selection: ModelSelection): string {
	return selection[0];
}

export function thinkingLevel(selection: ModelSelection): ThinkingLevel {
	return selection[1] ?? "off";
}
