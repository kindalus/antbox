import { describe, it } from "bdd";
import { expect } from "expect";
import type { AntboxTenant } from "./antbox_tenant.ts";
import {
	startWorkflowHandler,
	transitionWorkflowHandler,
	updateWorkflowNodeFileHandler,
} from "./workflow_handlers.ts";
import { right } from "shared/either.ts";

function makeTenant(overrides: Partial<AntboxTenant> = {}): AntboxTenant {
	return {
		name: "default",
		rootPasswd: "root",
		symmetricKey: "secret",
		limits: { storage: 1, tokens: 1 },
		configurationRepository: {} as AntboxTenant["configurationRepository"],
		nodeService: {} as AntboxTenant["nodeService"],
		aspectsService: {} as AntboxTenant["aspectsService"],
		featuresService: {} as AntboxTenant["featuresService"],
		apiKeysService: {} as AntboxTenant["apiKeysService"],
		groupsService: {} as AntboxTenant["groupsService"],
		usersService: {} as AntboxTenant["usersService"],
		articleService: {} as AntboxTenant["articleService"],
		auditLoggingService: {} as AntboxTenant["auditLoggingService"],
		workflowsService: {} as AntboxTenant["workflowsService"],
		workflowInstancesService: {} as AntboxTenant["workflowInstancesService"],
		agentsService: {} as AntboxTenant["agentsService"],
		notificationsService: {} as AntboxTenant["notificationsService"],
		userPreferencesService: {} as AntboxTenant["userPreferencesService"],
		externalLoginService: {} as AntboxTenant["externalLoginService"],
		metricsService: {} as AntboxTenant["metricsService"],
		featuresEngine: {} as AntboxTenant["featuresEngine"],
		agentsEngine: {} as AntboxTenant["agentsEngine"],
		workflowInstancesEngine: {} as AntboxTenant["workflowInstancesEngine"],
		...overrides,
	};
}

describe("workflow_handlers", () => {
	it("returns bad request when start payload is missing nodeUuid", async () => {
		const handler = startWorkflowHandler([makeTenant()]);

		const response = await handler(
			new Request("http://localhost/v2/workflow-instances/-/start", {
				method: "POST",
				body: JSON.stringify({ workflowDefinitionUuid: "workflow-001" }),
				headers: { "Content-Type": "application/json" },
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "{ nodeUuid } not given" });
	});

	it("forwards participants override to the workflow engine on start", async () => {
		const calls: Array<{
			nodeUuid: string;
			workflowDefinitionUuid: string;
			participants?: string[];
		}> = [];
		const handler = startWorkflowHandler([
			makeTenant({
				workflowInstancesEngine: {
					startWorkflow: async (
						_ctx: unknown,
						nodeUuid: string,
						workflowDefinitionUuid: string,
						participants?: string[],
					) => {
						calls.push({ nodeUuid, workflowDefinitionUuid, participants });
						return right({
							uuid: "instance-001",
							workflowDefinitionUuid,
							workflowDefinition: {
								uuid: workflowDefinitionUuid,
								title: "Workflow",
								description: "",
								createdTime: new Date().toISOString(),
								modifiedTime: new Date().toISOString(),
								states: [],
								availableStateNames: [],
								participants: participants ?? [],
							},
							nodeUuid,
							currentStateName: "Open",
							history: [],
							running: true,
							cancelled: false,
							participants: participants ?? [],
							owner: "owner@example.com",
							startedTime: new Date().toISOString(),
							modifiedTime: new Date().toISOString(),
						});
					},
				} as unknown as AntboxTenant["workflowInstancesEngine"],
			}),
		]);

		const response = await handler(
			new Request("http://localhost/v2/workflow-instances/-/start", {
				method: "POST",
				body: JSON.stringify({
					nodeUuid: "node-001",
					workflowDefinitionUuid: "workflow-001",
					participants: ["--editors--"],
				}),
				headers: { "Content-Type": "application/json" },
			}),
		);

		expect(response.status).toBe(200);
		expect(calls).toEqual([
			{
				nodeUuid: "node-001",
				workflowDefinitionUuid: "workflow-001",
				participants: ["--editors--"],
			},
		]);
	});

	it("returns bad request when transition payload is missing signal", async () => {
		const handler = transitionWorkflowHandler([makeTenant()]);

		const response = await handler(
			new Request("http://localhost/v2/workflow-instances/instance-001/-/transition", {
				method: "POST",
				body: JSON.stringify({}),
				headers: {
					"Content-Type": "application/json",
					"x-params": JSON.stringify({ uuid: "instance-001" }),
				},
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "{ signal } not given" });
	});

	it("returns bad request when workflow file update request omits file", async () => {
		const handler = updateWorkflowNodeFileHandler([makeTenant()]);
		const formData = new FormData();

		const response = await handler(
			new Request("http://localhost/v2/workflow-instances/instance-001/-/update-file", {
				method: "PUT",
				body: formData,
				headers: { "x-params": JSON.stringify({ uuid: "instance-001" }) },
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "{ file } not given in form data" });
	});
});
