import { describe, it } from "bdd";
import { expect } from "expect";
import {
	chatHistoryToModelMessages,
	stepsToChatMessages,
	validateChatHistory,
} from "./messages.ts";
import type { ChatHistory } from "domain/ai/chat_message.ts";

describe("aisdk messages", () => {
	describe("chatHistoryToModelMessages", () => {
		it("converts user messages to user ModelMessage with text content", () => {
			const history: ChatHistory = [
				{ role: "user", parts: [{ text: "hello" }] },
			];
			expect(chatHistoryToModelMessages(history)).toEqual([
				{ role: "user", content: "hello" },
			]);
		});

		it("converts model messages with text only to assistant text content", () => {
			const history: ChatHistory = [
				{ role: "model", parts: [{ text: "world" }] },
			];
			expect(chatHistoryToModelMessages(history)).toEqual([
				{ role: "assistant", content: "world" },
			]);
		});

		it("converts a model message with tool calls to assistant content parts", () => {
			const history: ChatHistory = [
				{
					role: "model",
					parts: [
						{ text: "let me check" },
						{
							toolCall: {
								id: "call-1",
								name: "find_nodes",
								args: { filters: "x" },
							},
						},
					],
				},
			];
			const result = chatHistoryToModelMessages(history);
			expect(result).toEqual([
				{
					role: "assistant",
					content: [
						{ type: "text", text: "let me check" },
						{
							type: "tool-call",
							toolCallId: "call-1",
							toolName: "find_nodes",
							input: { filters: "x" },
						},
					],
				},
			]);
		});

		it("converts tool messages to tool ModelMessage with tool-result parts", () => {
			const history: ChatHistory = [
				{
					role: "tool",
					parts: [{
						toolResponse: {
							id: "call-1",
							name: "find_nodes",
							text: '{"results":[]}',
						},
					}],
				},
			];
			expect(chatHistoryToModelMessages(history)).toEqual([
				{
					role: "tool",
					content: [{
						type: "tool-result",
						toolCallId: "call-1",
						toolName: "find_nodes",
						output: { type: "text", value: '{"results":[]}' },
					}],
				},
			]);
		});
	});

	describe("validateChatHistory", () => {
		it("accepts an empty history", () => {
			expect(validateChatHistory([]).isRight()).toBe(true);
		});

		it("accepts paired tool call and tool response", () => {
			const history: ChatHistory = [
				{ role: "user", parts: [{ text: "find x" }] },
				{
					role: "model",
					parts: [{
						toolCall: { id: "c1", name: "find_nodes", args: {} },
					}],
				},
				{
					role: "tool",
					parts: [{
						toolResponse: { id: "c1", name: "find_nodes", text: "[]" },
					}],
				},
				{ role: "model", parts: [{ text: "no results" }] },
			];
			expect(validateChatHistory(history).isRight()).toBe(true);
		});

		it("rejects a tool call with no following tool message", () => {
			const history: ChatHistory = [
				{
					role: "model",
					parts: [{
						toolCall: { id: "c1", name: "find_nodes", args: {} },
					}],
				},
				{ role: "model", parts: [{ text: "stranded" }] },
			];
			const result = validateChatHistory(history);
			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("InvalidChatHistory");
			}
		});

		it("rejects a tool call without a matching response id", () => {
			const history: ChatHistory = [
				{
					role: "model",
					parts: [{
						toolCall: { id: "c1", name: "find_nodes", args: {} },
					}],
				},
				{
					role: "tool",
					parts: [{
						toolResponse: { id: "c2", name: "find_nodes", text: "[]" },
					}],
				},
			];
			expect(validateChatHistory(history).isLeft()).toBe(true);
		});

		it("rejects a tool message with no preceding model message", () => {
			const history: ChatHistory = [
				{
					role: "tool",
					parts: [{
						toolResponse: { id: "c1", name: "find_nodes", text: "[]" },
					}],
				},
			];
			expect(validateChatHistory(history).isLeft()).toBe(true);
		});
	});

	describe("stepsToChatMessages", () => {
		it("returns empty array for no steps", () => {
			expect(stepsToChatMessages([])).toEqual([]);
		});
	});
});
