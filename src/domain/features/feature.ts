import type { FeatureData, FeatureParameter } from "domain/configuration/feature_data.ts";
import type { NodeFilter } from "domain/nodes/node_filter.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { RunContext } from "domain/features/feature_run_context.ts";

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

export interface UploadedFeature extends Omit<Feature, "uuid"> {
	uuid?: string;
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

export interface LegacyFeatureData extends Omit<FeatureData, "run"> {
	run?: string;
	module?: string;
}

type SerializableFeature = Omit<Feature, "run"> & { run: string | Feature["run"] };

function featureFileName(uuid: string): string {
	return `${uuid}.js`;
}

function asFeatureData(
	feature: FeatureData | LegacyFeatureData,
	run: string,
): FeatureData {
	return {
		uuid: feature.uuid,
		title: feature.title,
		description: feature.description,
		exposeAction: feature.exposeAction,
		runOnCreates: feature.runOnCreates,
		runOnUpdates: feature.runOnUpdates,
		runOnDeletes: feature.runOnDeletes,
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
		tags: feature.tags,
		run,
		createdTime: feature.createdTime,
		modifiedTime: feature.modifiedTime,
	};
}

export function normalizeRunSource(run: string | Feature["run"]): string {
	const source = typeof run === "string" ? run.trim() : run.toString().trim();

	if (/^async\s+run\s*\(/.test(source)) {
		return source.replace(/^async\s+run\s*\(/, "async function(");
	}

	if (/^run\s*\(/.test(source)) {
		return source.replace(/^run\s*\(/, "function(");
	}

	return source;
}

export function featureToFeatureData(
	feature: Feature,
): Omit<FeatureData, "createdTime" | "modifiedTime"> {
	return {
		uuid: feature.uuid,
		title: feature.title,
		description: feature.description,
		exposeAction: feature.exposeAction,
		runOnCreates: feature.runOnCreates,
		runOnUpdates: feature.runOnUpdates,
		runOnDeletes: feature.runOnDeletes,
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
		tags: feature.tags,
		run: normalizeRunSource(feature.run),
	};
}

export function featureToModuleSource(feature: SerializableFeature): string {
	return `export default {
	uuid: ${JSON.stringify(feature.uuid)},
	title: ${JSON.stringify(feature.title)},
	description: ${JSON.stringify(feature.description)},
	exposeAction: ${feature.exposeAction},
	runOnCreates: ${feature.runOnCreates},
	runOnUpdates: ${feature.runOnUpdates},
	runOnDeletes: ${feature.runOnDeletes},
	runManually: ${feature.runManually},
	filters: ${JSON.stringify(feature.filters)},
	exposeExtension: ${feature.exposeExtension},
	exposeAITool: ${feature.exposeAITool},
	runAs: ${JSON.stringify(feature.runAs) ?? "undefined"},
	groupsAllowed: ${JSON.stringify(feature.groupsAllowed)},
	parameters: ${JSON.stringify(feature.parameters)},
	returnType: ${JSON.stringify(feature.returnType)},
	returnDescription: ${JSON.stringify(feature.returnDescription) ?? "undefined"},
	returnContentType: ${JSON.stringify(feature.returnContentType) ?? "undefined"},
	tags: ${JSON.stringify(feature.tags ?? [])},
	run: ${normalizeRunSource(feature.run)}
};
`;
}

export function featureToFile(feature: Feature): File {
	return new File(
		[featureToModuleSource(feature)],
		featureFileName(feature.uuid),
		{ type: "application/vnd.antbox.feature" },
	);
}

export async function normalizeFeatureData(
	feature: FeatureData | LegacyFeatureData,
): Promise<Either<AntboxError, FeatureData>> {
	if (typeof feature.run === "string" && feature.run.trim()) {
		return right(asFeatureData(feature, normalizeRunSource(feature.run)));
	}

	const legacyModule = "module" in feature ? feature.module : undefined;
	if (typeof legacyModule !== "string" || !legacyModule.trim()) {
		return left(new BadRequestError("Feature run is required"));
	}

	const parsedOrErr = await fileToFeature(
		new File([legacyModule], "feature.js", { type: "application/javascript" }),
	);
	if (parsedOrErr.isLeft()) {
		return left(parsedOrErr.value);
	}

	return right(asFeatureData(feature, normalizeRunSource(parsedOrErr.value.run)));
}

export async function featureDataToModuleSource(
	feature: FeatureData | LegacyFeatureData,
): Promise<Either<AntboxError, string>> {
	const normalizedOrErr = await normalizeFeatureData(feature);
	if (normalizedOrErr.isLeft()) {
		return left(normalizedOrErr.value);
	}

	return right(featureToModuleSource(normalizedOrErr.value));
}

export async function featureDataToFile(
	feature: FeatureData | LegacyFeatureData,
): Promise<Either<AntboxError, File>> {
	const moduleOrErr = await featureDataToModuleSource(feature);
	if (moduleOrErr.isLeft()) {
		return left(moduleOrErr.value);
	}

	return right(
		new File(
			[moduleOrErr.value],
			featureFileName(feature.uuid),
			{ type: "application/javascript" },
		),
	);
}

export async function featureDataToFeature(
	feature: FeatureData | LegacyFeatureData,
): Promise<Either<AntboxError, Feature>> {
	const moduleOrErr = await featureDataToModuleSource(feature);
	if (moduleOrErr.isLeft()) {
		return left(moduleOrErr.value);
	}

	return fileToFeature(
		new File([moduleOrErr.value], "feature.js", { type: "application/javascript" }),
	);
}

async function loadUploadedFeature(file: File): Promise<Either<AntboxError, UploadedFeature>> {
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
			const importFunc = new globalThis.Function("url", "return import(url)");
			const module = await importFunc(url);

			if (!module.default) {
				return left(new BadRequestError("Module must have a default export"));
			}

			const feature = module.default as UploadedFeature;

			if (!feature.title) {
				return left(new BadRequestError("Feature must have a title"));
			}

			if (!feature.run || typeof feature.run !== "function") {
				return left(new BadRequestError("Feature must implement a run method"));
			}

			return right(feature);
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

export async function fileToUploadedFeature(
	file: File,
): Promise<Either<AntboxError, UploadedFeature>> {
	return loadUploadedFeature(file);
}

export async function fileToFeature(
	file: File,
): Promise<Either<AntboxError, Feature>> {
	const featureOrErr = await loadUploadedFeature(file);
	if (featureOrErr.isLeft()) {
		return left(featureOrErr.value);
	}

	if (!featureOrErr.value.uuid) {
		return left(new BadRequestError("Feature must have a uuid"));
	}

	return right(featureOrErr.value as Feature);
}
