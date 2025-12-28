import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { AspectsService } from "./aspects_service.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { AspectProperty } from "domain/configuration/aspect_data.ts";
import type { NodeFilter } from "domain/nodes/node_filter.ts";

describe("AspectsService", () => {
	const adminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "admin@test.com",
			groups: [ADMINS_GROUP_UUID],
		},
		mode: "Action",
	};

	const nonAdminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "user@test.com",
			groups: ["regular-users"],
		},
		mode: "Action",
	};

	describe("createAspect", () => {
		it("should create aspect successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const properties: AspectProperty[] = [
				{
					name: "author_name",
					title: "Author Name",
					type: "string",
					required: true,
				},
				{
					name: "publish_date",
					title: "Publish Date",
					type: "string",
					readonly: false,
				},
			];

			const filters: NodeFilter[] = [["mimetype", "==", "text/markdown"]];

			const aspectData = {
				title: "Article Aspect",
				description: "Metadata for articles",
				filters,
				properties,
			};

			const result = await service.createAspect(adminCtx, aspectData);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const aspect = result.value;
				expect(aspect.title).toBe("Article Aspect");
				expect(aspect.description).toBe("Metadata for articles");
				expect(aspect.filters.length).toBe(1);
				expect(aspect.properties.length).toBe(2);
				expect(aspect.properties[0].name).toBe("author_name");
				expect(aspect.properties[0].required).toBe(true);
				expect(typeof aspect.uuid).toBe("string");
				expect(typeof aspect.createdTime).toBe("string");
				expect(typeof aspect.modifiedTime).toBe("string");
			}
		});

		it("should create aspect with empty filters and properties", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const result = await service.createAspect(adminCtx, {
				title: "Simple Aspect",
				filters: [],
				properties: [],
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.filters.length).toBe(0);
				expect(result.value.properties.length).toBe(0);
			}
		});

		it("should reject creation as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const result = await service.createAspect(nonAdminCtx, {
				title: "Test Aspect",
				filters: [],
				properties: [],
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should validate aspect title length", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const result = await service.createAspect(adminCtx, {
				title: "AB",
				filters: [],
				properties: [],
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ValidationError");
			}
		});

		it("should validate property name format", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const properties: AspectProperty[] = [
				{
					name: "a", // Too short
					title: "Invalid Property",
					type: "string",
				},
			];

			const result = await service.createAspect(adminCtx, {
				title: "Invalid Aspect",
				filters: [],
				properties,
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ValidationError");
			}
		});
	});

	describe("getAspect", () => {
		it("should get aspect successfully", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const createResult = await service.createAspect(adminCtx, {
				title: "Test Aspect",
				description: "Test description",
				filters: [],
				properties: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.getAspect(adminCtx, createResult.value.uuid);

				expect(result.isRight()).toBe(true);
				if (result.isRight()) {
					expect(result.value.uuid).toBe(createResult.value.uuid);
					expect(result.value.title).toBe("Test Aspect");
				}
			}
		});

		it("should allow non-admin to get aspect", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const createResult = await service.createAspect(adminCtx, {
				title: "Public Aspect",
				filters: [],
				properties: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.getAspect(nonAdminCtx, createResult.value.uuid);

				expect(result.isRight()).toBe(true);
			}
		});

		it("should return error for non-existent aspect", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const result = await service.getAspect(adminCtx, "nonexistent");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});

	describe("listAspects", () => {
		it("should list all aspects", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			await service.createAspect(adminCtx, {
				title: "Aspect A",
				filters: [],
				properties: [],
			});

			await service.createAspect(adminCtx, {
				title: "Aspect B",
				filters: [],
				properties: [],
			});

			const result = await service.listAspects(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const aspects = result.value;
				expect(aspects.length).toBe(2);
				// Should be sorted by title
				expect(aspects[0].title).toBe("Aspect A");
				expect(aspects[1].title).toBe("Aspect B");
			}
		});

		it("should allow non-admin to list aspects", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			await service.createAspect(adminCtx, {
				title: "Public Aspect",
				filters: [],
				properties: [],
			});

			const result = await service.listAspects(nonAdminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(1);
			}
		});

		it("should return empty list when no aspects exist", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const result = await service.listAspects(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(0);
			}
		});
	});

	describe("updateAspect", () => {
		it("should update aspect successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const createResult = await service.createAspect(adminCtx, {
				title: "Original Title",
				description: "Original description",
				filters: [],
				properties: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const updateResult = await service.updateAspect(
					adminCtx,
					createResult.value.uuid,
					{
						title: "Updated Title",
						description: "Updated description",
					},
				);

				expect(updateResult.isRight()).toBe(true);
				if (updateResult.isRight()) {
					expect(updateResult.value.title).toBe("Updated Title");
					expect(updateResult.value.description).toBe("Updated description");
					expect(updateResult.value.uuid).toBe(createResult.value.uuid);
				}
			}
		});

		it("should update aspect properties", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const createResult = await service.createAspect(adminCtx, {
				title: "Test Aspect",
				filters: [],
				properties: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const newProperties: AspectProperty[] = [
					{
						name: "new_field",
						title: "New Field",
						type: "string",
					},
				];

				const updateResult = await service.updateAspect(
					adminCtx,
					createResult.value.uuid,
					{
						properties: newProperties,
					},
				);

				expect(updateResult.isRight()).toBe(true);
				if (updateResult.isRight()) {
					expect(updateResult.value.properties.length).toBe(1);
					expect(updateResult.value.properties[0].name).toBe("new_field");
				}
			}
		});

		it("should reject update as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const createResult = await service.createAspect(adminCtx, {
				title: "Test Aspect",
				filters: [],
				properties: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.updateAspect(
					nonAdminCtx,
					createResult.value.uuid,
					{ title: "Hacked" },
				);

				expect(result.isLeft()).toBe(true);
				if (result.isLeft()) {
					expect(result.value.errorCode).toBe("ForbiddenError");
				}
			}
		});

		it("should return error when updating non-existent aspect", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const result = await service.updateAspect(adminCtx, "nonexistent", {
				title: "Updated",
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});

	describe("deleteAspect", () => {
		it("should delete aspect successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const createResult = await service.createAspect(adminCtx, {
				title: "Temporary Aspect",
				filters: [],
				properties: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const deleteResult = await service.deleteAspect(adminCtx, createResult.value.uuid);

				expect(deleteResult.isRight()).toBe(true);

				// Verify it's deleted
				const getResult = await service.getAspect(adminCtx, createResult.value.uuid);
				expect(getResult.isLeft()).toBe(true);
			}
		});

		it("should reject delete as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const createResult = await service.createAspect(adminCtx, {
				title: "Test Aspect",
				filters: [],
				properties: [],
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.deleteAspect(nonAdminCtx, createResult.value.uuid);

				expect(result.isLeft()).toBe(true);
				if (result.isLeft()) {
					expect(result.value.errorCode).toBe("ForbiddenError");
				}
			}
		});

		it("should return error when deleting non-existent aspect", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const result = await service.deleteAspect(adminCtx, "nonexistent");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});

	describe("complex properties", () => {
		it("should handle properties with all fields", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new AspectsService(repo);

			const properties: AspectProperty[] = [
				{
					name: "email_field",
					title: "Email",
					type: "string",
					required: true,
					validationRegex: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
				},
				{
					name: "status_field",
					title: "Status",
					type: "string",
					validationList: ["draft", "published", "archived"],
					defaultValue: "draft",
				},
				{
					name: "tags_field",
					title: "Tags",
					type: "array",
					arrayType: "string",
				},
			];

			const filters: NodeFilter[] = [["mimetype", "==", "application/json"]];

			const result = await service.createAspect(adminCtx, {
				title: "Complex Aspect",
				filters,
				properties,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const aspect = result.value;
				expect(aspect.properties.length).toBe(3);
				expect(aspect.properties[0].validationRegex).toBeDefined();
				expect(aspect.properties[1].validationList).toEqual(["draft", "published", "archived"]);
				expect(aspect.properties[2].arrayType).toBe("string");
			}
		});
	});
});
