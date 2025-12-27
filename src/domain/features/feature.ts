import { FeatureParameter } from "domain/configuration/feature_data.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { RunContext } from "domain/features/feature_run_context.ts";

export interface Feature {
	uuid: string;
	title: string;
	description: string;
	exposeAction: boolean;
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runOnDeletes: boolean;
	runManually: boolean;
	filters: NodeFilter[];

	exposeExtension: boolean;
	exposeAITool: boolean;

	runAs?: string;
	groupsAllowed: string[];
	parameters: FeatureParameter[];

	returnType:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	returnDescription?: string;
	returnContentType?: string;
	tags?: string[];

	run(ctx: RunContext, args: Record<string, unknown>): Promise<unknown>;
}

export interface FeatureMetadata {
	uuid: string;
	name: string;
	description: string;
	exposeAction: boolean;
	runOnCreates: boolean;
	runOnUpdates: boolean;
	runManually: boolean;
	filters: NodeFilter[];
	exposeExtension: boolean;
	exposeAITool: boolean;
	runAs?: string;
	groupsAllowed: string[];
	parameters: FeatureParameter[];
	returnType:
		| "string"
		| "number"
		| "boolean"
		| "array"
		| "object"
		| "file"
		| "void";
	returnDescription?: string;
	returnContentType?: string;
	tags: string[];
}

export function featureToFile(feature: Feature): File {
	const runFunction = feature.run.toString();

	const content = `export default {
uuid: ${JSON.stringify(feature.uuid)},
name: ${JSON.stringify(feature.title)},
description: ${JSON.stringify(feature.description)},
exposeAction: ${feature.exposeAction},
exposeAITool: ${feature.exposeAITool},
exposeExtension: ${feature.exposeExtension},
// Actions only
runOnCreates: ${feature.runOnCreates ?? false},
runOnUpdates: ${feature.runOnUpdates ?? false},
runOnDeletes: ${feature.runOnDeletes ?? false},
runManually: ${feature.runManually ?? false},
// End Actions only
filters: ${JSON.stringify(feature.filters)},
runAs: ${JSON.stringify(feature.runAs)},
groupsAllowed: ${JSON.stringify(feature.groupsAllowed)},
parameters: ${JSON.stringify(feature.parameters)},
returnType: ${JSON.stringify(feature.returnType)},
returnDescription: ${JSON.stringify(feature.returnDescription) ?? '""'},
returnContentType: ${JSON.stringify(feature.returnContentType) ?? '""'},
tags: ${JSON.stringify(feature.tags) ?? "[]"},
run: ${runFunction}
};`;

	return new File(
		[content],
		`${feature.title}.js`,
		{ type: "application/vnd.antbox.feature" },
	);
}

export async function fileToFeature(
	file: File,
): Promise<Either<AntboxError, Feature>> {
	if (
		file.type !== "text/javascript" &&
		file.type !== "application/javascript" &&
		file.type !== "application/vnd.antbox.feature"
	) {
		return left(new BadRequestError(`Invalid file type: ${file.type}`));
	}

	try {
		const text = await file.text();
		const url = URL.createObjectURL(
			new Blob([text], { type: "application/javascript" }),
		);

		try {
			// Workaround to avoid type issues with dynamic import
			const importFunc = new globalThis.Function("url", "return import(url)");
			const module = await importFunc(url);

			if (!module.default) {
				return left(new BadRequestError("Module must have a default export"));
			}

			const func = module.default as Feature;

			if (!func.uuid) {
				return left(new BadRequestError("Feature must have a uuid"));
			}

			if (!func.title) {
				return left(new BadRequestError("Feature must have a title"));
			}

			if (!func.run || typeof func.run !== "function") {
				return left(new BadRequestError("Feature must implement a run method"));
			}

			return right(func);
		} finally {
			URL.revokeObjectURL(url);
		}
	} catch (error) {
		return left(
			new BadRequestError(
				`Failed to parse feature: ${(error as Error).message}`,
			),
		);
	}
}
