import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { AgentNode } from "./agent_node.ts";
import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";

describe("AgentNode", () => {
	describe("create", () => {
		it("should initialize with required fields", () => {
			const agent = AgentNode.create({
				title: "Customer Support Agent",
				description: "Helps customers with their queries",
				owner: "admin@example.com",
				model: "gemini-2.0-flash-exp",
				temperature: 0.8,
				maxTokens: 4096,
				reasoning: true,
				useTools: true,
				systemInstructions: "You are a helpful customer support agent.",
			});

			expect(agent.isRight()).toBeTruthy();
			expect(agent.right.title).toBe("Customer Support Agent");
			expect(agent.right.description).toBe("Helps customers with their queries");
			expect(agent.right.model).toBe("gemini-2.0-flash-exp");
			expect(agent.right.temperature).toBe(0.8);
			expect(agent.right.maxTokens).toBe(4096);
			expect(agent.right.reasoning).toBe(true);
			expect(agent.right.useTools).toBe(true);
			expect(agent.right.systemInstructions).toBe("You are a helpful customer support agent.");
			expect(agent.right.mimetype).toBe(Nodes.AGENT_MIMETYPE);
			expect(agent.right.parent).toBe(Folders.AGENTS_FOLDER_UUID);
		});

		it("should use default values", () => {
			const agent = AgentNode.create({
				title: "Default Agent",
				owner: "admin@example.com",
				systemInstructions: "Default instructions",
			});

			expect(agent.isRight()).toBeTruthy();
			expect(agent.right.model).toBe("default");
			expect(agent.right.temperature).toBe(0.7);
			expect(agent.right.maxTokens).toBe(8192);
			expect(agent.right.reasoning).toBe(false);
			expect(agent.right.useTools).toBe(false);
		});

		it("should fail if owner is missing", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				systemInstructions: "Test instructions",
			});

			expect(agent.isLeft()).toBeTruthy();
			expect((agent.value as ValidationError).message).toBe("Node.owner is required");
		});

		it("should fail if systemInstructions is missing", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "",
			});

			expect(agent.isLeft()).toBeTruthy();
			expect((agent.value as ValidationError).message).toBe(
				"Node.systemInstructions is required",
			);
		});

		it("should fail if temperature is out of range", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				temperature: 3.0,
			});

			expect(agent.isLeft()).toBeTruthy();
			expect(agent.value).toBeInstanceOf(ValidationError);
		});

		it("should fail if maxTokens is invalid", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				maxTokens: 0,
			});

			expect(agent.isLeft()).toBeTruthy();
			expect(agent.value).toBeInstanceOf(ValidationError);
		});

		it("should accept structuredAnswer", () => {
			const schema = JSON.stringify({
				type: "object",
				properties: {
					answer: { type: "string" },
					confidence: { type: "number" },
				},
			});

			const agent = AgentNode.create({
				title: "Structured Agent",
				owner: "admin@example.com",
				systemInstructions: "Return structured data",
				structuredAnswer: schema,
			});

			expect(agent.isRight()).toBeTruthy();
			expect(agent.right.structuredAnswer).toBe(schema);
		});
	});

	describe("update", () => {
		it("should modify model", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				model: "default",
			});

			const result = agent.right.update({ model: "gemini-2.0-flash-exp" });
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.model).toBe("gemini-2.0-flash-exp");
		});

		it("should modify temperature", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				temperature: 0.7,
			});

			const result = agent.right.update({ temperature: 1.0 });
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.temperature).toBe(1.0);
		});

		it("should modify maxTokens", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				maxTokens: 8192,
			});

			const result = agent.right.update({ maxTokens: 16384 });
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.maxTokens).toBe(16384);
		});

		it("should modify reasoning", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				reasoning: false,
			});

			const result = agent.right.update({ reasoning: true });
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.reasoning).toBe(true);
		});

		it("should modify useTools", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				useTools: false,
			});

			const result = agent.right.update({ useTools: true });
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.useTools).toBe(true);
		});

		it("should modify systemInstructions", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Old instructions",
			});

			const result = agent.right.update({
				systemInstructions: "New instructions",
			});
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.systemInstructions).toBe("New instructions");
		});

		it("should modify structuredAnswer", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
			});

			const schema = JSON.stringify({ type: "object" });
			const result = agent.right.update({ structuredAnswer: schema });
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.structuredAnswer).toBe(schema);
		});

		it("should fail if temperature is out of range", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
				temperature: 0.7,
			});

			const result = agent.right.update({ temperature: -1 });
			expect(result.isLeft()).toBeTruthy();
			expect(result.value).toBeInstanceOf(ValidationError);
		});

		it("should fail if systemInstructions is empty", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
			});

			const result = agent.right.update({ systemInstructions: "" });
			expect(result.isLeft()).toBeTruthy();
			expect(result.value).toBeInstanceOf(ValidationError);
		});

		it("should not modify parent", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
			});

			const result = agent.right.update({ parent: "--root--" });
			expect(result.isRight()).toBeTruthy();
			expect(agent.right.parent).toBe(Folders.AGENTS_FOLDER_UUID);
		});
	});

	describe("validation", () => {
		it("toJSON should return complete metadata", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				description: "Test description",
				owner: "admin@example.com",
				model: "gemini-2.0-flash-exp",
				temperature: 0.8,
				maxTokens: 4096,
				reasoning: true,
				useTools: true,
				systemInstructions: "Test instructions",
				structuredAnswer: '{"type":"object"}',
			});

			const json = agent.right.toJSON();
			expect(json.title).toBe("Test Agent");
			expect(json.description).toBe("Test description");
			expect(json.model).toBe("gemini-2.0-flash-exp");
			expect(json.temperature).toBe(0.8);
			expect(json.maxTokens).toBe(4096);
			expect(json.reasoning).toBe(true);
			expect(json.useTools).toBe(true);
			expect(json.systemInstructions).toBe("Test instructions");
			expect(json.structuredAnswer).toBe('{"type":"object"}');
			expect(json.mimetype).toBe(Nodes.AGENT_MIMETYPE);
			expect(json.parent).toBe(Folders.AGENTS_FOLDER_UUID);
		});

		it("should generate uuid if not provided", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
			});

			expect(agent.isRight()).toBeTruthy();
			expect(agent.right.uuid).toBeDefined();
			expect(agent.right.uuid.length).toBeGreaterThan(0);
		});

		it("should use provided uuid", () => {
			const agent = AgentNode.create({
				uuid: "custom-uuid-123",
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
			});

			expect(agent.isRight()).toBeTruthy();
			expect(agent.right.uuid).toBe("custom-uuid-123");
		});

		it("should validate title length", () => {
			const agent = AgentNode.create({
				title: "AB",
				owner: "admin@example.com",
				systemInstructions: "Test",
			});

			expect(agent.isLeft()).toBeTruthy();
			expect(agent.value).toBeInstanceOf(ValidationError);
		});

		it("Nodes.isAgent should correctly identify AgentNode", () => {
			const agent = AgentNode.create({
				title: "Test Agent",
				owner: "admin@example.com",
				systemInstructions: "Test",
			});

			expect(Nodes.isAgent(agent.right)).toBe(true);
		});
	});
});
