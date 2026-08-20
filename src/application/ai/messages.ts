import type {
	Api,
	AssistantMessage,
	Message,
	Model,
	ToolResultMessage,
	Usage,
} from "@earendil-works/pi-ai";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type {
	ChatHistory,
	ChatMessage,
	ChatMessagePart,
	TokenUsage,
} from "domain/ai/chat_message.ts";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

export function chatHistoryToPiMessages(
	history: ChatHistory,
	model: Model<Api>,
	timestamp = Date.now(),
): Message[] {
	const messages: Message[] = [];
	let pendingCalls: Array<{ id: string; name: string }> = [];

	for (let messageIndex = 0; messageIndex < history.length; messageIndex++) {
		const message = history[messageIndex];
		switch (message.role) {
			case "user": {
				const content = collectText(message.parts);
				if (content) messages.push({ role: "user", content, timestamp });
				pendingCalls = [];
				break;
			}
			case "model": {
				const text = collectText(message.parts);
				const calls = message.parts.flatMap((part, partIndex) => {
					if (!part.toolCall) return [];
					return [{
						type: "toolCall" as const,
						id: part.toolCall.id ?? syntheticToolCallId(messageIndex, partIndex),
						name: part.toolCall.name,
						arguments: part.toolCall.args,
					}];
				});
				if (!text && calls.length === 0) break;
				pendingCalls = calls.map((call) => ({ id: call.id, name: call.name }));
				messages.push({
					role: "assistant",
					content: [
						...(text ? [{ type: "text" as const, text }] : []),
						...calls,
					],
					api: model.api,
					provider: model.provider,
					model: model.id,
					usage: tokenUsageToPiUsage(message.usage),
					stopReason: calls.length > 0 ? "toolUse" : "stop",
					timestamp,
				});
				break;
			}
			case "tool": {
				const responses = message.parts.flatMap((part) =>
					part.toolResponse ? [part.toolResponse] : []
				);
				for (let responseIndex = 0; responseIndex < responses.length; responseIndex++) {
					const response = responses[responseIndex];
					const paired = response.id
						? pendingCalls.find((call) => call.id === response.id) ??
							pendingCalls[responseIndex]
						: pendingCalls[responseIndex];
					messages.push({
						role: "toolResult",
						toolCallId: paired?.id ?? response.id ??
							syntheticToolCallId(messageIndex - 1, responseIndex),
						toolName: response.name,
						content: [{ type: "text", text: response.text }],
						details: response.text,
						isError: false,
						timestamp,
					});
				}
				pendingCalls = [];
				break;
			}
		}
	}

	return messages;
}

export function piMessagesToChatMessages(messages: readonly Message[]): ChatMessage[] {
	const output: ChatMessage[] = [];
	for (const message of messages) {
		if (message.role === "user") continue;
		if (message.role === "assistant") {
			const parts: ChatMessagePart[] = [];
			for (const content of message.content) {
				if (content.type === "text" && content.text) parts.push({ text: content.text });
				if (content.type === "toolCall") {
					parts.push({
						toolCall: {
							id: content.id,
							name: content.name,
							args: content.arguments,
						},
					});
				}
			}
			if (parts.length > 0) output.push({ role: "model", parts });
			continue;
		}

		appendToolResult(output, message);
	}
	return output;
}

export function piUsageToTokenUsage(usage: Usage | undefined): TokenUsage | undefined {
	if (!usage) return undefined;
	return {
		promptTokens: usage.input + usage.cacheRead + usage.cacheWrite,
		completionTokens: usage.output,
		totalTokens: usage.totalTokens,
	};
}

export function piMessagesUsage(messages: readonly Message[]): TokenUsage | undefined {
	const usages = messages
		.filter((message): message is AssistantMessage => message.role === "assistant")
		.map((message) => piUsageToTokenUsage(message.usage))
		.filter((usage): usage is TokenUsage => usage !== undefined);
	if (usages.length === 0) return undefined;
	return usages.reduce<TokenUsage>(
		(total, usage) => ({
			promptTokens: total.promptTokens + usage.promptTokens,
			completionTokens: total.completionTokens + usage.completionTokens,
			totalTokens: total.totalTokens + usage.totalTokens,
		}),
		{ promptTokens: 0, completionTokens: 0, totalTokens: 0 },
	);
}

function appendToolResult(output: ChatMessage[], message: ToolResultMessage): void {
	const part: ChatMessagePart = {
		toolResponse: {
			id: message.toolCallId,
			name: message.toolName,
			text: message.content
				.filter((content) => content.type === "text")
				.map((content) => content.text)
				.join(""),
		},
	};
	const last = output.at(-1);
	if (last?.role === "tool") last.parts.push(part);
	else output.push({ role: "tool", parts: [part] });
}

function collectText(parts: ChatMessagePart[]): string {
	return parts.map((part) => part.text ?? "").join("").trim();
}

function syntheticToolCallId(messageIndex: number, partIndex: number): string {
	return `antbox-tool-${messageIndex}-${partIndex}`;
}

function tokenUsageToPiUsage(usage?: TokenUsage): Usage {
	return {
		input: usage?.promptTokens ?? 0,
		output: usage?.completionTokens ?? 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: usage?.totalTokens ?? 0,
		cost: ZERO_COST,
	};
}

/**
 * Validate that tool calls and responses are paired. Calls without public IDs
 * are paired by position because the domain contract permits optional IDs.
 */
export function validateChatHistory(history: ChatHistory): Either<AntboxError, void> {
	for (let i = 0; i < history.length; i++) {
		const message = history[i];
		if (message.role !== "model") continue;
		const calls = message.parts.flatMap((part) => part.toolCall ? [part.toolCall] : []);
		if (calls.length === 0) continue;

		const next = history[i + 1];
		if (!next || next.role !== "tool") {
			return left(
				new AntboxError(
					"InvalidChatHistory",
					`Model message at index ${i} has tool calls but no following tool message`,
				),
			);
		}
		const responses = next.parts.flatMap((part) => part.toolResponse ? [part.toolResponse] : []);
		for (let callIndex = 0; callIndex < calls.length; callIndex++) {
			const call = calls[callIndex];
			const paired = call.id
				? responses.find((response) => response.id === call.id)
				: responses[callIndex];
			if (!paired || paired.name !== call.name) {
				return left(
					new AntboxError(
						"InvalidChatHistory",
						`Tool call '${call.name}' at history index ${i} has no matching response`,
					),
				);
			}
		}
	}

	for (let i = 0; i < history.length; i++) {
		if (history[i].role !== "tool") continue;
		if (history[i - 1]?.role !== "model") {
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
