import { InMemoryRunner, isFinalResponse } from "@google/adk";
import { describe, it } from "bdd";
import { expect } from "expect";
import { right } from "shared/either.ts";
import { RagAgent } from "./rag_agent.ts";

function extractSection(input: string, label: string): string {
	const prefix = `${label}:\n`;
	const index = input.indexOf(prefix);
	if (index === -1) {
		throw new Error(`${label} section missing from input: ${input}`);
	}

	return input.slice(index + prefix.length);
}

describe("RagAgent", () => {
	it("uses semantic hits and skips keyword inference", async () => {
		const calls: string[] = [];
		const agent = new RagAgent({
			sdk: {
				nodes: {
					semanticQuery: async () =>
						right([
							{
								uuid: "node-1",
								title: "Vacation Policy 2025",
								content: "Employees receive 22 vacation days per year.",
							},
						]),
					find: async () => right({ pageToken: 1, pageSize: 20, nodes: [] }),
				} as unknown as import("application/nodes/node_service_proxy.ts").NodeServiceProxy,
			},
			defaultModel: "test-model",
			stageRunner: async (stage, input) => {
				calls.push(stage);
				expect(stage).toBe("summarize");
				expect(extractSection(input, "Search results")).toBe(
					"Employees receive 22 vacation days per year.",
				);
				return {
					text: "According to Vacation Policy 2025, employees receive 22 vacation days.",
					usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
				};
			},
		});

		const runner = new InMemoryRunner({ agent, appName: "rag-test" });
		let finalText = "";
		let totalTokenCount = 0;

		for await (
			const event of runner.runEphemeral({
				userId: "test@example.com",
				newMessage: { role: "user", parts: [{ text: "How many vacation days do I get?" }] },
			})
		) {
			if (isFinalResponse(event) && event.content?.parts) {
				finalText = event.content.parts.map((part) => part.text ?? "").join("");
				totalTokenCount = event.usageMetadata?.totalTokenCount ?? 0;
			}
		}

		expect(calls).toEqual(["summarize"]);
		expect(finalText).toBe(
			"According to Vacation Policy 2025, employees receive 22 vacation days.",
		);
		expect(totalTokenCount).toBe(6);
	});

	it("uses keyword inference fallback, performs one find per keyword, and merges results", async () => {
		const findCalls: unknown[] = [];
		const calls: string[] = [];
		const agent = new RagAgent({
			sdk: {
				nodes: {
					semanticQuery: async () => right([]),
					find: async (filters: unknown) => {
						findCalls.push(filters);
						if (findCalls.length === 1) {
							return right({
								pageToken: 1,
								pageSize: 20,
								nodes: [{
									uuid: "node-2",
									title: "Remote Work Guidelines",
									description: "Teams may work remotely up to 3 days per week.",
									parent: "folder-1",
								}],
							});
						}
						if (findCalls.length === 2) {
							return right({
								pageToken: 1,
								pageSize: 20,
								nodes: [{
									uuid: "node-3",
									title: "Remote Work FAQ",
									description: "Remote work requires manager approval.",
									parent: "folder-2",
								}, {
									uuid: "node-2",
									title: "Remote Work Guidelines",
									description: "Teams may work remotely up to 3 days per week.",
									parent: "folder-1",
								}],
							});
						}
						if (findCalls.length === 3) {
							return right({
								pageToken: 1,
								pageSize: 20,
								nodes: [],
							});
						}

						return right({
							pageToken: 1,
							pageSize: 20,
							nodes: [
								{ uuid: "folder-1", title: "HR Policies", parent: "" },
								{ uuid: "folder-2", title: "Employee FAQs", parent: "" },
							],
						});
					},
				} as unknown as import("application/nodes/node_service_proxy.ts").NodeServiceProxy,
			},
			defaultModel: "test-model",
			stageRunner: async (stage, input) => {
				calls.push(stage);
				if (stage === "keywords") {
					expect(extractSection(input, "User query")).toBe("What is the remote work policy?");
					return {
						text: JSON.stringify(["remote work", "policy", "approval"]),
						usageMetadata: {
							promptTokenCount: 2,
							candidatesTokenCount: 1,
							totalTokenCount: 3,
						},
					};
				}

				expect(JSON.parse(extractSection(input, "Search results"))).toEqual([
					{
						uuid: "node-2",
						name: "Remote Work Guidelines",
						snippet: "Teams may work remotely up to 3 days per week.",
						parent: "folder-1",
						parentTitle: "HR Policies",
					},
					{
						uuid: "node-3",
						name: "Remote Work FAQ",
						snippet: "Remote work requires manager approval.",
						parent: "folder-2",
						parentTitle: "Employee FAQs",
					},
				]);
				return {
					text: "Remote work is allowed up to 3 days per week with manager approval.",
					usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
				};
			},
		});

		const runner = new InMemoryRunner({ agent, appName: "rag-test" });
		let finalText = "";
		let totalTokenCount = 0;

		for await (
			const event of runner.runEphemeral({
				userId: "test@example.com",
				newMessage: { role: "user", parts: [{ text: "What is the remote work policy?" }] },
			})
		) {
			if (isFinalResponse(event) && event.content?.parts) {
				finalText = event.content.parts.map((part) => part.text ?? "").join("");
				totalTokenCount = event.usageMetadata?.totalTokenCount ?? 0;
			}
		}

		expect(calls).toEqual(["keywords", "summarize"]);
		expect(findCalls).toEqual([
			[["fulltext", "match", "remote work"]],
			[["fulltext", "match", "policy"]],
			[["fulltext", "match", "approval"]],
			[["uuid", "in", ["folder-1", "folder-2"]]],
		]);
		expect(finalText).toBe("Remote work is allowed up to 3 days per week with manager approval.");
		expect(totalTokenCount).toBe(9);
	});

	it("returns empty search payload when keyword inference yields no usable results", async () => {
		const calls: string[] = [];
		const agent = new RagAgent({
			sdk: {
				nodes: {
					semanticQuery: async () => right([]),
					find: async () => right({ pageToken: 1, pageSize: 20, nodes: [] }),
				} as unknown as import("application/nodes/node_service_proxy.ts").NodeServiceProxy,
			},
			defaultModel: "test-model",
			stageRunner: async (stage, input) => {
				calls.push(stage);
				if (stage === "keywords") {
					return { text: JSON.stringify([]) };
				}

				expect(extractSection(input, "Search results")).toBe("");
				return { text: "No relevant documents were found." };
			},
		});

		const runner = new InMemoryRunner({ agent, appName: "rag-test" });
		let finalText = "";

		for await (
			const event of runner.runEphemeral({
				userId: "test@example.com",
				newMessage: { role: "user", parts: [{ text: "Tell me about teleportation rules." }] },
			})
		) {
			if (isFinalResponse(event) && event.content?.parts) {
				finalText = event.content.parts.map((part) => part.text ?? "").join("");
			}
		}

		expect(calls).toEqual(["keywords", "summarize"]);
		expect(finalText).toBe("No relevant documents were found.");
	});

	it("uses recent conversation context for follow-up search queries", async () => {
		const semanticQueries: string[] = [];
		const calls: string[] = [];

		const agent = new RagAgent({
			sdk: {
				nodes: {
					semanticQuery: async (text: string) => {
						semanticQueries.push(text);
						return right([
							{
								uuid: `node-${semanticQueries.length}`,
								title: semanticQueries.length === 1
									? "Remote Work Guidelines"
									: "Contractor Remote Work Addendum",
								content: semanticQueries.length === 1
									? "Remote work is allowed up to 3 days per week."
									: "Contractors need manager approval for remote work.",
							},
						]);
					},
					find: async () => right({ pageToken: 1, pageSize: 20, nodes: [] }),
				} as unknown as import("application/nodes/node_service_proxy.ts").NodeServiceProxy,
			},
			defaultModel: "test-model",
			stageRunner: async (stage, input) => {
				calls.push(stage);
				if (stage === "rewrite") {
					expect(input).toContain("Conversation context:\nUser: What is the remote work policy?");
					expect(input).toContain("Current user question:\nWhat about contractors?");
					return { text: "What is the remote work policy for contractors?" };
				}

				if (calls.filter((call) => call === "summarize").length === 1) {
					expect(input).toContain("User query:\nWhat is the remote work policy?");
					return { text: "Remote work is allowed up to 3 days per week." };
				}

				expect(input).toContain("User query:\nWhat about contractors?");
				expect(input).toContain("Resolved query:\nWhat is the remote work policy for contractors?");
				expect(input).toContain("Conversation context:\nUser: What is the remote work policy?");
				return { text: "Contractors need manager approval for remote work." };
			},
		});

		const runner = new InMemoryRunner({ agent, appName: "rag-test" });
		const session = await runner.sessionService.createSession({
			appName: "rag-test",
			userId: "test@example.com",
		});

		for await (
			const _event of runner.runAsync({
				userId: "test@example.com",
				sessionId: session.id,
				newMessage: { role: "user", parts: [{ text: "What is the remote work policy?" }] },
			})
		) {
			// Drain first turn events to populate session history.
		}

		let finalText = "";
		for await (
			const event of runner.runAsync({
				userId: "test@example.com",
				sessionId: session.id,
				newMessage: { role: "user", parts: [{ text: "What about contractors?" }] },
			})
		) {
			if (isFinalResponse(event) && event.content?.parts) {
				finalText = event.content.parts.map((part) => part.text ?? "").join("");
			}
		}

			expect(semanticQueries).toEqual([
				"What is the remote work policy?",
				"What is the remote work policy for contractors?",
			]);
			expect(calls).toEqual(["summarize", "rewrite", "summarize"]);
			expect(finalText).toBe("Contractors need manager approval for remote work.");
	});

	it("rewrites counting follow-ups into standalone queries and shares context with summarizer", async () => {
		const semanticQueries: string[] = [];
		const calls: string[] = [];

		const agent = new RagAgent({
			sdk: {
				nodes: {
					semanticQuery: async (text: string) => {
						semanticQueries.push(text);
						return right([
							{
								uuid: `node-${semanticQueries.length}`,
								title: semanticQueries.length === 1 ? "Courses" : "Courses Count",
								content: semanticQueries.length === 1
									? "Courses on the system: Algebra, Biology, Chemistry."
									: "There are 3 courses on the system: Algebra, Biology, Chemistry.",
							},
						]);
					},
					find: async () => right({ pageToken: 1, pageSize: 20, nodes: [] }),
				} as unknown as import("application/nodes/node_service_proxy.ts").NodeServiceProxy,
			},
			defaultModel: "test-model",
			stageRunner: async (stage, input) => {
				calls.push(stage);
				if (stage === "rewrite") {
					expect(input).toContain("User: Which couses we have on system?");
					expect(input).toContain("Current user question:\nSo how many are they");
					return { text: "How many courses are on the system?" };
				}

				if (calls.filter((call) => call === "summarize").length === 1) {
					return { text: "The system has Algebra, Biology, and Chemistry." };
				}

				expect(input).toContain("User query:\nSo how many are they");
				expect(input).toContain("Resolved query:\nHow many courses are on the system?");
				expect(input).toContain("Conversation context:\nUser: Which couses we have on system?");
				expect(input).toContain("Assistant: The system has Algebra, Biology, and Chemistry.");
				return { text: "There are 3 courses on the system." };
			},
		});

		const runner = new InMemoryRunner({ agent, appName: "rag-test" });
		const session = await runner.sessionService.createSession({
			appName: "rag-test",
			userId: "test@example.com",
		});

		for await (
			const _event of runner.runAsync({
				userId: "test@example.com",
				sessionId: session.id,
				newMessage: { role: "user", parts: [{ text: "Which couses we have on system?" }] },
			})
		) {
			// Drain first turn events to populate session history.
		}

		let finalText = "";
		for await (
			const event of runner.runAsync({
				userId: "test@example.com",
				sessionId: session.id,
				newMessage: { role: "user", parts: [{ text: "So how many are they" }] },
			})
		) {
			if (isFinalResponse(event) && event.content?.parts) {
				finalText = event.content.parts.map((part) => part.text ?? "").join("");
			}
		}

		expect(semanticQueries).toEqual([
			"Which couses we have on system?",
			"How many courses are on the system?",
		]);
		expect(calls).toEqual(["summarize", "rewrite", "summarize"]);
		expect(finalText).toBe("There are 3 courses on the system.");
	});
});
