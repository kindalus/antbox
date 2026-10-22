import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { BUILTIN_USERS } from "domain/configuration/builtin_users.ts";
import { BUILTIN_GROUPS } from "domain/configuration/builtin_groups.ts";
import { BUILTIN_FEATURES } from "domain/configuration/builtin_features.ts";
import { BUILTIN_AGENTS } from "domain/configuration/builtin_agents.ts";
import { BUILTIN_WORKFLOWS } from "domain/configuration/builtin_workflows.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import { UsersService } from "./security/users_service.ts";
import { GroupsService } from "./security/groups_service.ts";
import { FeaturesService } from "./features/features_service.ts";
import { AgentsService } from "./ai/agents_service.ts";
import { customAgentRegistry, customAgents } from "./ai/custom_agents/index.ts";
import { WorkflowsService } from "./workflows/workflows_service.ts";
import type { AuthenticationContext } from "./security/authentication_context.ts";

const admin: AuthenticationContext = {
	tenant: "first",
	mode: "Direct",
	principal: { email: "root@antbox.io", groups: ["--admins--"] },
};

interface ConfigurationCase {
	name: string;
	builtin: object;
	field: string;
	nested?: string;
	get(repo: InMemoryConfigurationRepository, ctx: AuthenticationContext): Promise<
		Either<AntboxError, object>
	>;
	list(repo: InMemoryConfigurationRepository, ctx: AuthenticationContext): Promise<
		Either<AntboxError, object[]>
	>;
}

function identifier(value: object): string {
	return Reflect.get(value, "uuid") ?? Reflect.get(value, "email");
}

Deno.test("built-in configuration reads cannot change another tenant's definitions", async (t) => {
	const custom = { ...structuredClone(BUILTIN_AGENTS[0]), uuid: "snapshot-custom-agent" };
	customAgents.push(custom);
	customAgentRegistry.set(custom.uuid, {
		data: custom,
		create() {
			throw new Error("This test only reads agent configuration");
		},
	});
	const cases: ConfigurationCase[] = [
		{
			name: "users",
			builtin: BUILTIN_USERS[0],
			field: "title",
			nested: "groups",
			get: (repo, ctx) => new UsersService(repo).getUser(ctx, BUILTIN_USERS[0].email),
			list: (repo, ctx) => new UsersService(repo).listUsers(ctx),
		},
		{
			name: "groups",
			builtin: BUILTIN_GROUPS[0],
			field: "title",
			get: (repo, ctx) => new GroupsService(repo).getGroup(ctx, BUILTIN_GROUPS[0].uuid),
			list: (repo, ctx) => new GroupsService(repo).listGroups(ctx),
		},
		{
			name: "features",
			builtin: BUILTIN_FEATURES[0],
			field: "description",
			nested: "parameters",
			get: (repo, ctx) =>
				new FeaturesService({ configRepo: repo }).getFeature(ctx, BUILTIN_FEATURES[0].uuid),
			list: (repo, ctx) => new FeaturesService({ configRepo: repo }).listFeatures(ctx),
		},
		...([BUILTIN_AGENTS[0], custom].map((agent) => ({
			name: agent === custom ? "registered agents" : "built-in agents",
			builtin: agent,
			field: "description",
			nested: "tools",
			get: (repo, ctx) => new AgentsService({ configRepo: repo }).getAgent(ctx, agent.uuid),
			list: (repo, ctx) => new AgentsService({ configRepo: repo }).listAgents(ctx),
		})) satisfies ConfigurationCase[]),
		{
			name: "workflows",
			builtin: BUILTIN_WORKFLOWS[0],
			field: "description",
			nested: "states",
			get: (repo, ctx) => new WorkflowsService(repo).getWorkflow(ctx, BUILTIN_WORKFLOWS[0].uuid),
			list: (repo, ctx) => new WorkflowsService(repo).listWorkflows(ctx),
		},
	];
	try {
		for (const fixture of cases) {
			const expected = structuredClone(fixture.builtin);
			for (const method of ["get", "list"] as const) {
				await t.step(`${fixture.name} ${method} returns independent nested data`, async () => {
					const first = new InMemoryConfigurationRepository();
					const second = new InMemoryConfigurationRepository();
					try {
						const result = (await fixture[method](first, admin)).right;
						const record = Array.isArray(result)
							? result.find((value) => identifier(value) === identifier(fixture.builtin))!
							: result;
						Reflect.set(record, fixture.field, "Unsaved local change");
						const nested = fixture.nested && Reflect.get(record, fixture.nested);
						if (Array.isArray(nested)) {
							if (typeof nested[0] === "object" && nested[0] !== null) {
								Reflect.set(nested[0], "description", "Unsaved nested change");
							}
							nested.push("Unsaved array entry");
						}
						const other = { ...admin, tenant: "second" };
						expect((await fixture.get(second, other)).right).toEqual(expected);
						expect(
							(await fixture.list(second, other)).right.find((value) =>
								identifier(value) === identifier(fixture.builtin)
							),
						).toEqual(expected);
						expect(fixture.builtin).toEqual(expected);
					} finally {
						Object.assign(fixture.builtin, structuredClone(expected));
					}
				});
			}
		}
	} finally {
		customAgentRegistry.delete(custom.uuid);
		customAgents.splice(customAgents.indexOf(custom), 1);
	}
});
