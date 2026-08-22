import { ASPECT_FIELD_EXTRACTOR_AGENT_UUID } from "application/ai/builtin_agents/aspect_field_extractor_agent.ts";
import type { AspectsService } from "application/aspects/aspects_service.ts";
import type { ChatMessage } from "domain/ai/chat_message.ts";
import {
	AUTO_TAG_FEATURE_UUID,
	CALL_AGENT_FEATURE_UUID,
} from "domain/configuration/builtin_features.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { Logger } from "shared/logger.ts";
import { toYamlMetadata } from "../nodes/node_markdown.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";

export interface AgentAnswerExecutor {
	runInternalAnswer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
	): Promise<Either<AntboxError, ChatMessage>>;
}

interface BuiltinFeatureContext {
	nodeService: NodeService;
	agentsEngine?: AgentAnswerExecutor;
	aspectsService?: AspectsService;
}

export async function runBuiltinFeature<T>(
	dependencies: BuiltinFeatureContext,
	ctx: AuthenticationContext,
	featureUuid: string,
	params: Record<string, unknown>,
): Promise<Either<AntboxError, T> | undefined> {
	if (featureUuid === CALL_AGENT_FEATURE_UUID) {
		return await runCallAgentFeature(dependencies, ctx, params) as Either<AntboxError, T>;
	}

	if (featureUuid === AUTO_TAG_FEATURE_UUID) {
		return await runAutoTagFeature(dependencies, ctx, params) as Either<AntboxError, T>;
	}

	return undefined;
}

async function runCallAgentFeature(
	dependencies: BuiltinFeatureContext,
	ctx: AuthenticationContext,
	params: Record<string, unknown>,
): Promise<Either<AntboxError, { status: "started" | "completed"; message?: ChatMessage }>> {
	if (!dependencies.agentsEngine) {
		return left(new BadRequestError("Agents engine not available"));
	}

	const agentUuid = params.agentUuid;
	if (typeof agentUuid !== "string" || agentUuid.trim().length === 0) {
		return left(new BadRequestError("Parameter 'agentUuid' must be a non-empty string"));
	}

	const prompt = params.prompt;
	if (typeof prompt !== "string" || prompt.trim().length === 0) {
		return left(new BadRequestError("Parameter 'prompt' must be a non-empty string"));
	}

	const uuids = Array.isArray(params.uuids)
		? params.uuids.filter((uuid): uuid is string => typeof uuid === "string")
		: [];
	const runSync = toBoolean(params.runSync, false);
	const finalPrompt = await buildCallAgentPrompt(dependencies.nodeService, ctx, uuids, prompt);

	if (finalPrompt.isLeft()) {
		return left(finalPrompt.value);
	}

	if (!runSync) {
		void dependencies.agentsEngine.runInternalAnswer(ctx, agentUuid.trim(), finalPrompt.value)
			.then((result) => {
				if (result.isLeft()) {
					Logger.error(
						`Background agent action ${CALL_AGENT_FEATURE_UUID} failed for agent ${agentUuid}: ${result.value.message}`,
					);
				}
			})
			.catch((error) => {
				Logger.error(
					`Background agent action ${CALL_AGENT_FEATURE_UUID} failed for agent ${agentUuid}:`,
					error,
				);
			});

		return right({ status: "started" });
	}

	const answerOrErr = await dependencies.agentsEngine.runInternalAnswer(
		ctx,
		agentUuid.trim(),
		finalPrompt.value,
	);
	if (answerOrErr.isLeft()) {
		return left(answerOrErr.value);
	}

	return right({
		status: "completed",
		message: answerOrErr.value,
	});
}

async function buildCallAgentPrompt(
	nodeService: NodeService,
	ctx: AuthenticationContext,
	uuids: string[],
	prompt: string,
): Promise<Either<AntboxError, string>> {
	const nodesOrErr = await Promise.all(uuids.map((uuid) => nodeService.get(ctx, uuid)));
	const nodes = nodesOrErr
		.filter((nodeOrErr) => nodeOrErr.isRight())
		.map((nodeOrErr) => nodeOrErr.value);

	const contentsOrErr = await nodeService.getEmbeddingContents(
		ctx,
		nodes.map((node) => node.uuid),
	);
	if (contentsOrErr.isLeft()) {
		return left(contentsOrErr.value);
	}

	const relevantNodes = nodes.map((node, index) => {
		const contentMd = contentsOrErr.value[node.uuid];
		return contentMd ? contentMd : `[ metadata for node ${index} ]\n${toYamlMetadata(node)}`;
	});

	return right(
		`${prompt.trimEnd()}\n\nRelevant nodes metadata:\n\n${relevantNodes.join("\n\n")}`,
	);
}

function toBoolean(value: unknown, defaultValue: boolean): boolean {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["true", "1", "yes", "y"].includes(normalized)) {
			return true;
		}

		if (["false", "0", "no", "n", ""].includes(normalized)) {
			return false;
		}
	}

	return defaultValue;
}

async function runAutoTagFeature(
	dependencies: BuiltinFeatureContext,
	ctx: AuthenticationContext,
	params: Record<string, unknown>,
): Promise<Either<AntboxError, void>> {
	if (!dependencies.agentsEngine) {
		return left(new BadRequestError("Agents engine not available"));
	}

	if (!dependencies.aspectsService) {
		return left(new BadRequestError("Aspects service not available"));
	}

	const uuids = Array.isArray(params.uuids)
		? params.uuids.filter((uuid): uuid is string => typeof uuid === "string")
		: [];
	const aspects = Array.isArray(params.aspects)
		? params.aspects.filter((aspect): aspect is string => typeof aspect === "string")
		: [];

	if (uuids.length === 0) {
		return left(new BadRequestError("Parameter 'uuids' must be a non-empty array"));
	}

	if (aspects.length === 0) {
		return left(new BadRequestError("Parameter 'aspects' must be a non-empty array"));
	}

	for (const uuid of uuids) {
		const contentsOrErr = await dependencies.nodeService.getEmbeddingContents(ctx, [uuid]);
		if (contentsOrErr.isLeft()) {
			Logger.warn(`Auto-tag: failed to get embedding contents for node ${uuid}, skipping`);
			continue;
		}

		const contentMd = contentsOrErr.value[uuid];
		if (!contentMd) {
			Logger.warn(`Auto-tag: no contentMd available for node ${uuid}, skipping`);
			continue;
		}

		for (const aspectUuid of aspects) {
			const aspectOrErr = await dependencies.aspectsService.getAspect(ctx, aspectUuid);
			if (aspectOrErr.isLeft()) {
				Logger.warn(
					`Auto-tag: failed to get aspect ${aspectUuid}: ${aspectOrErr.value.message}, skipping`,
				);
				continue;
			}

			const aspect = aspectOrErr.value;
			const prompt = `## Document Content\n\n${contentMd}\n\n## Aspect Definition\n\n${
				JSON.stringify({
					uuid: aspect.uuid,
					title: aspect.title,
					properties: aspect.properties,
				})
			}`;

			const answerOrErr = await dependencies.agentsEngine.runInternalAnswer(
				ctx,
				ASPECT_FIELD_EXTRACTOR_AGENT_UUID,
				prompt,
			);
			if (answerOrErr.isLeft()) {
				Logger.warn(
					`Auto-tag: agent extraction failed for node ${uuid}, aspect ${aspectUuid}: ${answerOrErr.value.message}`,
				);
				continue;
			}

			let extractedValues: Record<string, unknown>;
			try {
				const responseText = answerOrErr.value.parts.map((part) => part.text ?? "").join("");
				const jsonMatch = responseText.match(/\{[\s\S]*\}/);
				extractedValues = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
			} catch {
				Logger.warn(
					`Auto-tag: failed to parse agent response for node ${uuid}, aspect ${aspectUuid}`,
				);
				continue;
			}

			const validPropertyNames = new Set(aspect.properties.map((property) => property.name));
			const properties: Record<string, unknown> = {};
			for (const [propertyName, propertyValue] of Object.entries(extractedValues)) {
				if (validPropertyNames.has(propertyName)) {
					properties[`${aspectUuid}:${propertyName}`] = propertyValue;
				}
			}

			if (Object.keys(properties).length === 0) {
				continue;
			}

			const nodeOrErr = await dependencies.nodeService.get(ctx, uuid);
			if (nodeOrErr.isLeft()) {
				Logger.warn(
					`Auto-tag: failed to get node ${uuid} for update: ${nodeOrErr.value.message}`,
				);
				continue;
			}

			const existingAspects = nodeOrErr.value.aspects ?? [];
			const newAspects = existingAspects.includes(aspectUuid)
				? existingAspects
				: [...existingAspects, aspectUuid];
			const updateOrErr = await dependencies.nodeService.update(ctx, uuid, {
				aspects: newAspects,
				properties: { ...nodeOrErr.value.properties, ...properties },
			} as NodeMetadata);

			if (updateOrErr.isLeft()) {
				Logger.warn(
					`Auto-tag: failed to update node ${uuid} with aspect ${aspectUuid}: ${updateOrErr.value.message}`,
				);
			}
		}
	}

	return right(undefined);
}
