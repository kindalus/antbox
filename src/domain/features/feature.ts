import { FeatureParameter } from "domain/features/feature_node.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { RunContext } from "domain/features/feature_run_context.ts";

export interface Feature {
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
}

export function featureToNodeMetadata(
	feature: Feature,
	owner?: string,
): Partial<NodeMetadata> {
	return {
		uuid: feature.uuid,
		title: feature.name,
		description: feature.description || "",
		parent: Folders.FEATURES_FOLDER_UUID,
		mimetype: Nodes.FEATURE_MIMETYPE,
		exposeAction: feature.exposeAction,
		runOnCreates: feature.runOnCreates,
		runOnUpdates: feature.runOnUpdates,
		runManually: feature.runManually,
		filters: feature.filters,
		exposeExtension: feature.exposeExtension,
		exposeAITool: feature.exposeAITool,
		runAs: feature.runAs,
		groupsAllowed: feature.groupsAllowed,
		parameters: feature.parameters,
		returnType: feature.returnType,
		returnDescription: feature.returnDescription,
		returnContentType: feature.returnContentType,
		owner: owner!,
	};
}

export async function fileToFeature(
	file: File,
): Promise<Either<AntboxError, Feature>> {
	if (
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

			if (!func.name) {
				return left(new BadRequestError("Feature must have a name"));
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
