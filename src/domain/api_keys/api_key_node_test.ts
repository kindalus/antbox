import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { ApiKeyNode } from "./api_key_node.ts";
import { describe, it } from "bdd";
import { expect } from "expect";
describe("ApiKeyNode", () => {
	describe("create", () => {
		it("should initialize", () => {
			const apiKey = ApiKeyNode.create({
				group: "admin",
				secret: "secret-pasword",
				description: "API Key super hard",
				title: "ApiKey test",
				owner: "user@domain.com",
			});

			expect(apiKey.right.title).toBe("secr******");
			expect(apiKey.right.group).toBe("admin");
			expect(apiKey.right.description).toBe("API Key super hard");
			expect(apiKey.right.mimetype).toBe(Nodes.API_KEY_MIMETYPE);
			expect(apiKey.right.parent).toBe(Folders.API_KEYS_FOLDER_UUID);
		});
	});

	describe("update", () => {
		it("should modify group", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				owner: "user@domain.com",
				secret: "secret",
				group: "admin",
			});

			const result = apiKey.right.update({ group: "users" });
			expect(result.isRight()).toBeTruthy();
			expect(apiKey.right.group).toBe("users");
		});

		it("should modify description", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				owner: "user@domain.com",
				secret: "secret",
				group: "admin",
				description: "api key desc",
			});

			const result = apiKey.right.update({ description: "api key" });
			expect(result.isRight()).toBeTruthy();
			expect(apiKey.right.description).toBe("api key");
		});

		it("should not modify parent", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				owner: "user@domain.com",
				secret: "secret",
				group: "admin",
			});

			const result = apiKey.right.update({ parent: "--root--" });

			expect(result.isRight()).toBeTruthy();
			expect(apiKey.right.parent).toBe(Folders.API_KEYS_FOLDER_UUID);
		});
	});

	describe("validation", () => {
		it("should throw error if owner is missing", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				secret: "secret",
				group: "admin",
			});

			expect(apiKey.isLeft()).toBeTruthy();
			expect((apiKey.value as ValidationError).message).toBe(
				"Node.owner is required",
			);
		});

		it("should throw error if secret is missing", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				secret: "",
				group: "admin",
				owner: "user@domain.com",
			});

			expect(apiKey.isLeft()).toBeTruthy();
			expect((apiKey.value as ValidationError).message).toBe(
				"Node.secret is required",
			);
		});

		it("should throw error if group is missing", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				secret: "secret",
				group: "",
				owner: "user@domain.com",
			});

			expect(apiKey.isLeft()).toBeTruthy();
			expect((apiKey.value as ValidationError).message).toBe(
				"Node.group is required",
			);
		});

		it("should throw error if secret is missing", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				owner: "user@domain.com",
				secret: "secret",
				group: "admin",
			});

			const result = apiKey.right.update({ secret: "" });

			expect(result.isLeft()).toBeTruthy();
			expect(result.value).toBeInstanceOf(ValidationError);
			expect((result.value as ValidationError).errors[0].message).toBe(
				"Node.secret is required",
			);
		});

		it("should throw error if group is missing", () => {
			const apiKey = ApiKeyNode.create({
				title: "Api key title",
				owner: "user@domain.com",
				secret: "secret",
				group: "admin",
			});

			const result = apiKey.right.update({ group: "" });

			expect(result.isLeft()).toBeTruthy();
			expect(result.value).toBeInstanceOf(ValidationError);
			expect((result.value as ValidationError).errors[0].message).toBe(
				"Node.group is required",
			);
		});
	});
});
