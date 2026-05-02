import type {
	AssistantContent,
	AssistantModelMessage,
	ModelMessage,
	StepResult,
	ToolCallPart,
	ToolModelMessage,
	ToolResultPart,
	ToolSet,
	UserModelMessage,
} from "ai";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type {
	ChatHistory,
	ChatMessage,
	ChatMessagePart,
	TokenUsage,
} from "domain/ai/chat_message.ts";

export function chatHistoryToModelMessages(history: ChatHistory): ModelMessage[] {
	const messages: ModelMessage[] = [];
	for (const message of history) {
		const converted = chatMessageToModelMessage(message);
		if (converted) messages.push(converted);
	}
	return messages;
}

function chatMessageToModelMessage(message: ChatMessage): ModelMessage | undefined {
	switch (message.role) {
		case "user": {
			const content = collectText(message.parts);
			if (!content.length) return undefined;
			return { role: "user", content } satisfies UserModelMessage;
		}
		case "model": {
			const text = collectText(message.parts);
			const toolCalls = collectToolCalls(message.parts);
			if (!text.length && toolCalls.length === 0) return undefined;

			const content: AssistantContent = toolCalls.length === 0 ? text : [
				...(text.length ? [{ type: "text" as const, text }] : []),
				...toolCalls,
			];
			return { role: "assistant", content } satisfies AssistantModelMessage;
		}
		case "tool": {
			const results = collectToolResults(message.parts);
			if (results.length === 0) return undefined;
			return { role: "tool", content: results } satisfies ToolModelMessage;
		}
	}
}

function collectText(parts: ChatMessagePart[]): string {
	return parts.map((part) => part.text ?? "").join("").trim();
}

function collectToolCalls(parts: ChatMessagePart[]): ToolCallPart[] {
	const out: ToolCallPart[] = [];
	for (const part of parts) {
		if (!part.toolCall) continue;
		out.push({
			type: "tool-call",
			toolCallId: part.toolCall.id ?? cryptoRandomId(),
			toolName: part.toolCall.name,
			input: part.toolCall.args,
		});
	}
	return out;
}

function collectToolResults(parts: ChatMessagePart[]): ToolResultPart[] {
	const out: ToolResultPart[] = [];
	for (const part of parts) {
		if (!part.toolResponse) continue;
		out.push({
			type: "tool-result",
			toolCallId: part.toolResponse.id ?? cryptoRandomId(),
			toolName: part.toolResponse.name,
			output: { type: "text", value: part.toolResponse.text },
		});
	}
	return out;
}

function cryptoRandomId(): string {
	return crypto.randomUUID();
}

export function stepsToChatMessages(steps: StepResult<ToolSet>[]): ChatMessage[] {
	const messages: ChatMessage[] = [];

	for (const step of steps) {
		const modelParts: ChatMessagePart[] = [];
		const toolParts: ChatMessagePart[] = [];

		if (step.text && step.text.length > 0) {
			modelParts.push({ text: step.text });
		}

		for (const call of step.toolCalls ?? []) {
			modelParts.push({
				toolCall: {
					id: call.toolCallId,
					name: call.toolName,
					args: (call.input ?? {}) as Record<string, unknown>,
				},
			});
		}

		for (const result of step.toolResults ?? []) {
			toolParts.push({
				toolResponse: {
					id: result.toolCallId,
					name: result.toolName,
					text: stringifyToolOutput(result.output),
				},
			});
		}

		if (modelParts.length > 0) {
			messages.push({ role: "model", parts: modelParts });
		}
		if (toolParts.length > 0) {
			messages.push({ role: "tool", parts: toolParts });
		}
	}

	return messages;
}

function stringifyToolOutput(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function aisdkUsageToTokenUsage(
	usage:
		| { inputTokens?: number; outputTokens?: number; totalTokens?: number }
		| undefined,
): TokenUsage | undefined {
	if (!usage) return undefined;
	return {
		promptTokens: usage.inputTokens ?? 0,
		completionTokens: usage.outputTokens ?? 0,
		totalTokens: usage.totalTokens ??
			((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)),
	};
}

/**
 * Validate that tool calls and tool responses are properly paired in chat history.
 * Each model message containing toolCall parts must be followed by a tool message
 * whose toolResponse parts cover every toolCall id, in order.
 */
export function validateChatHistory(history: ChatHistory): Either<AntboxError, void> {
	for (let i = 0; i < history.length; i++) {
		const message = history[i];
		if (message.role !== "model") continue;

		const toolCallIds = message.parts
			.map((part) => part.toolCall?.id)
			.filter((id): id is string => typeof id === "string");

		if (toolCallIds.length === 0) continue;

		const next = history[i + 1];
		if (!next || next.role !== "tool") {
			return left(
				new AntboxError(
					"InvalidChatHistory",
					`Model message at index ${i} has tool calls but no following tool message`,
				),
			);
		}

		const responseIds = new Set(
			next.parts
				.map((part) => part.toolResponse?.id)
				.filter((id): id is string => typeof id === "string"),
		);

		for (const id of toolCallIds) {
			if (!responseIds.has(id)) {
				return left(
					new AntboxError(
						"InvalidChatHistory",
						`Tool call id '${id}' at history index ${i} has no matching response`,
					),
				);
			}
		}
	}

	for (let i = 0; i < history.length; i++) {
		const message = history[i];
		if (message.role !== "tool") continue;
		const prev = history[i - 1];
		if (!prev || prev.role !== "model") {
			return left(
				new AntboxError(
					"InvalidChatHistory",
					`Tool message at index ${i} has no preceding model message`,
				),
			);
		}
	}

	return right(undefined);
}
