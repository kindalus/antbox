import { describe, it } from "bdd";
import { expect } from "expect";
import type { Message, Model } from "@earendil-works/pi-ai";
import {
	chatHistoryToPiMessages,
	piMessagesToChatMessages,
	piMessagesUsage,
	validateChatHistory,
} from "./messages.ts";
import type { ChatHistory } from "domain/ai/chat_message.ts";

const model = {
	id: "test-model",
	name: "Test",
	api: "openai-completions",
	provider: "test",
	baseUrl: "http://test.invalid",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 4096,
	maxTokens: 1024,
} as Model<"openai-completions">;

const usage = (input = 1, output = 1, cacheRead = 0, cacheWrite = 0) => ({
	input,
	output,
	cacheRead,
	cacheWrite,
	totalTokens: input + output + cacheRead + cacheWrite,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

describe("Pi messages", () => {
	it("converts public history to Pi messages and pairs missing tool IDs", () => {
		const history: ChatHistory = [
			{ role: "user", parts: [{ text: "find x" }] },
			{
				role: "model",
				parts: [
					{ text: "checking" },
					{ toolCall: { name: "find_nodes", args: { filters: "x" } } },
				],
			},
			{
				role: "tool",
				parts: [{
					toolResponse: { id: "client-only-id", name: "find_nodes", text: "[]" },
				}],
			},
		];

		const converted = chatHistoryToPiMessages(history, model, 123);
		expect(converted.map((message) => message.role)).toEqual([
			"user",
			"assistant",
			"toolResult",
		]);
		const assistant = converted[1];
		const result = converted[2];
		if (assistant.role !== "assistant" || result.role !== "toolResult") {
			throw new Error("bad test");
		}
		const call = assistant.content.find((part) => part.type === "toolCall");
		expect(call?.id).toBe("antbox-tool-1-1");
		expect(result.toolCallId).toBe(call?.id);
		expect(result.timestamp).toBe(123);
	});

	it("converts Pi assistant and adjacent tool results to public messages", () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "private" },
					{ type: "text", text: "checking" },
					{ type: "toolCall", id: "c1", name: "first", arguments: { value: 1 } },
					{ type: "toolCall", id: "c2", name: "second", arguments: {} },
				],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: usage(),
				stopReason: "toolUse",
				timestamp: 1,
			},
			{
				role: "toolResult",
				toolCallId: "c1",
				toolName: "first",
				content: [{ type: "text", text: '{"ok":1}' }],
				details: {},
				isError: false,
				timestamp: 2,
			},
			{
				role: "toolResult",
				toolCallId: "c2",
				toolName: "second",
				content: [{ type: "text", text: "done" }],
				details: {},
				isError: true,
				timestamp: 2,
			},
		];

		const converted = piMessagesToChatMessages(messages);
		expect(converted.map((message) => message.role)).toEqual(["model", "tool"]);
		expect(JSON.stringify(converted)).not.toContain("private");
		expect(converted[1].parts.length).toBe(2);
		expect(converted[1].parts[1].toolResponse?.id).toBe("c2");
	});

	it("aggregates cache tokens as prompt usage", () => {
		const messages: Message[] = [
			{
				role: "assistant",
				content: [{ type: "text", text: "one" }],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: usage(2, 3, 4, 5),
				stopReason: "stop",
				timestamp: 1,
			},
		];
		expect(piMessagesUsage(messages)).toEqual({
			promptTokens: 11,
			completionTokens: 3,
			totalTokens: 14,
		});
	});

	describe("validateChatHistory", () => {
		it("accepts paired calls with and without IDs", () => {
			const history: ChatHistory = [
				{
					role: "model",
					parts: [
						{ toolCall: { id: "c1", name: "one", args: {} } },
						{ toolCall: { name: "two", args: {} } },
					],
				},
				{
					role: "tool",
					parts: [
						{ toolResponse: { id: "c1", name: "one", text: "1" } },
						{ toolResponse: { name: "two", text: "2" } },
					],
				},
			];
			expect(validateChatHistory(history).isRight()).toBe(true);
		});

		it("rejects orphan and mismatched tool messages", () => {
			expect(
				validateChatHistory([{
					role: "model",
					parts: [{ toolCall: { id: "c1", name: "one", args: {} } }],
				}]).isLeft(),
			).toBe(true);
			expect(
				validateChatHistory([{
					role: "tool",
					parts: [{ toolResponse: { id: "c1", name: "one", text: "1" } }],
				}]).isLeft(),
			).toBe(true);
		});
	});
});
