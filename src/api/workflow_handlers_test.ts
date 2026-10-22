import { describe, it } from "bdd";
import { expect } from "expect";
import type { AntboxTenant } from "./antbox_tenant.ts";
import {
	createOrReplaceWorkflowDefinitionHandler,
	startWorkflowHandler,
	transitionWorkflowHandler,
	updateWorkflowNodeFileHandler,
	updateWorkflowNodeHandler,
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
	it("rejects invalid JSON value types before calling workflow services", async () => {
		let calls = 0;
		const operation = () => {
			calls++;
			return Promise.resolve(right(undefined));
		};
		const tenant = makeTenant({
			workflowInstancesEngine: {
				startWorkflow: operation,
				transition: operation,
				updateNode: operation,
			} as unknown as AntboxTenant["workflowInstancesEngine"],
			workflowsService: {
				createOrReplaceWorkflow: operation,
			} as unknown as AntboxTenant["workflowsService"],
		});
		for (
			const [handler, bodies] of [
				[startWorkflowHandler([tenant]), [
					{ nodeUuid: 17, workflowDefinitionUuid: "definition" },
					{ nodeUuid: "node-001", workflowDefinitionUuid: {} },
					{
						nodeUuid: "node-001",
						workflowDefinitionUuid: "definition",
						participants: "editors",
					},
					{ nodeUuid: "node-001", workflowDefinitionUuid: "definition", participants: [4] },
				]],
				[transitionWorkflowHandler([tenant]), [{ signal: 17 }, {
					signal: "finish",
					message: {},
				}]],
				[updateWorkflowNodeHandler([tenant]), [null, [], "text"]],
				[createOrReplaceWorkflowDefinitionHandler([tenant]), [null, [], "text"]],
			] as const
		) {
			for (const body of bodies) {
				const response = await handler(
					new Request("http://localhost/v2/workflows", {
						method: "POST",
						headers: { "x-params": JSON.stringify({ uuid: "instance-001" }) },
						body: JSON.stringify(body),
					}),
				);
				expect(response.status).toBe(400);
			}
		}
		expect(calls).toBe(0);
	});

	it("requires a File part and forwards valid workflow content uploads", async () => {
		const files: File[] = [];
		const tenant = makeTenant({
			workflowInstancesEngine: {
				updateNodeFile: (_ctx: unknown, _uuid: string, file: File) => {
					files.push(file);
					return Promise.resolve(right(undefined));
				},
			} as unknown as AntboxTenant["workflowInstancesEngine"],
		});
		const handler = updateWorkflowNodeFileHandler([tenant]);
		for (const value of ["not-a-file", new File(["contents"], "content.txt")]) {
			const body = new FormData();
			body.set("file", value);
			const response = await handler(
				new Request("http://localhost/v2/workflow-instances/instance-001/-/update-file", {
					method: "PUT",
					headers: { "x-params": JSON.stringify({ uuid: "instance-001" }) },
					body,
				}),
			);
			expect(response.status).toBe(typeof value === "string" ? 400 : 200);
		}
		expect(files.length).toBe(1);
		expect(await files[0].text()).toBe("contents");
	});

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
