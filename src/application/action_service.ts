import { Action, actionToNode, fileToAction } from "../domain/actions/action.ts";
import { ActionNode } from "../domain/actions/action_node.ts";
import { RunContext } from "../domain/actions/run_context.ts";
import { AuthContextProvider } from "../domain/auth/auth_provider.ts";
import { UserNotFoundError } from "../domain/auth/user_not_found_error.ts";
import { filtersSpecFrom, withNodeFilters } from "../domain/nodes/filters_spec.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeCreatedEvent } from "../domain/nodes/node_created_event.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeFilter } from "../domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { NodeUpdatedEvent } from "../domain/nodes/node_updated_event.ts";
import { UserNode } from "../domain/nodes/user_node.ts";
import { UserNodeBuilder } from "../domain/nodes/user_node_builder.ts";
import { AntboxError, BadRequestError, UnknownError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { AntboxService } from "./antbox_service.ts";
import { antboxToNodeService } from "./antbox_to_node_service.ts";
import { builtinActions } from "./builtin_actions/mod.ts";
import { Root } from "./builtin_users/root.ts";
import { NodeService } from "./node_service.ts";

type RecordKey = [string, string];
interface RunnableRecord {
	count: number;
	timestamp: number;
}

export class ActionService {
	static #runnable: Map<RecordKey, RunnableRecord> = new Map();

	static #getRunnable(key: RecordKey): RunnableRecord {
		if (!this.#runnable.has(key)) {
			this.#runnable.set(key, { count: 1, timestamp: Date.now() });
		}

		return this.#runnable.get(key)!;
	}

	static #incRunnable(key: RecordKey) {
		const runnable = this.#getRunnable(key);
		this.#runnable.set(key, { count: runnable?.count ?? 0 + 1, timestamp: Date.now() });
	}

	static #deleteRunnable(key: RecordKey) {
		this.#runnable.delete(key);
	}

	constructor(
		private readonly nodeService: NodeService,
		private readonly antboxService: AntboxService,
	) {}

	async get(uuid: string): Promise<Either<NodeNotFoundError, ActionNode>> {
		const found = builtinActions.find((a) => a.uuid === uuid);

		if (found) {
			return right(actionToNode(found));
		}

		const nodeOrErr = await this.nodeService.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!nodeOrErr.value.isAction()) {
			return left(new NodeNotFoundError(uuid));
		}

		return right(nodeOrErr.value);
	}

	async list(): Promise<Either<AntboxError, ActionNode[]>> {
		const nodesOrErrs = await this.nodeService.find([
			["mimetype", "==", Node.ACTION_MIMETYPE],
			["parent", "==", Node.ACTIONS_FOLDER_UUID],
		], Number.MAX_SAFE_INTEGER);

		if (nodesOrErrs.isLeft()) {
			return left(nodesOrErrs.value);
		}

		const nodes = [
			...nodesOrErrs.value.nodes as ActionNode[],
			...builtinActions.map(actionToNode),
		].sort((a, b) => a.title.localeCompare(b.title));

		return right(nodes);
	}

	async createOrReplace(
		file: File,
	): Promise<Either<AntboxError, Node>> {
		const actionOrErr = await fileToAction(file);

		if (actionOrErr.isLeft()) {
			return left(actionOrErr.value);
		}

		const action = actionOrErr.value;

		const nodeOrErr = await this.nodeService.get(action.uuid);
		if (nodeOrErr.isLeft()) {
			const metadata = NodeFactory.createMetadata(
				action.uuid,
				action.uuid,
				Node.ACTION_MIMETYPE,
				file.size,
				action,
			);

			return this.nodeService.createFile(file, metadata);
		}

		const metadata = NodeFactory.extractMetadata({ ...action, mimetype: Node.ACTION_MIMETYPE });

		const decoratedFile = new File(
			[file],
			nodeOrErr.value.title,
			{ type: nodeOrErr.value.mimetype },
		);

		let voidOrErr = await this.nodeService.updateFile(action.uuid, decoratedFile);
		if (voidOrErr.isLeft()) {
			return left<AntboxError, Node>(voidOrErr.value);
		}

		voidOrErr = await this.nodeService.update(action.uuid, metadata);
		if (voidOrErr.isLeft()) {
			return left<AntboxError, Node>(voidOrErr.value);
		}

		return this.nodeService.get(action.uuid);
	}

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		const nodeOrErr = await this.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		return this.nodeService.delete(uuid);
	}

	async run(
		authContext: AuthContextProvider,
		actionUuid: string,
		nodesUuids: string[],
		params?: Record<string, string>,
	): Promise<Either<AntboxError, void>> {
		if (await this.#ranTooManyTimes(actionUuid, nodesUuids)) {
			const message = `Action ran too many times: ${actionUuid}${nodesUuids.join(",")}`;
			console.error(message);
			return left(new BadRequestError(message));
		}

		const actionOrErr = await this.#getNodeAsAction(actionUuid);
		if (actionOrErr.isLeft()) {
			return left(actionOrErr.value);
		}

		const action = actionOrErr.value;

		if (!action.runManually && authContext.mode === "Direct") {
			return left(new BadRequestError("Action cannot be run manually"));
		}

		const uuidsOrErr = await this.#getValidNodesForAction(
			action,
			nodesUuids,
		);

		if (uuidsOrErr.isLeft()) {
			return left(uuidsOrErr.value);
		}

		if (uuidsOrErr.value.length === 0) {
			return right(undefined);
		}

		const error = await action
			.run(
				this.#buildRunContext(authContext, action.runAs),
				uuidsOrErr.value,
				params,
			)
			.catch((e) => e);

		if (error) {
			return (error as AntboxError).errorCode
				? left(error as AntboxError)
				: left(new UnknownError(error.message));
		}

		return right(undefined);
	}

	async #getNodeAsAction(uuid: string): Promise<Either<AntboxError, Action>> {
		if (builtinActions.some((a) => a.uuid === uuid)) {
			return right(builtinActions.find((a) => a.uuid === uuid)!);
		}

		const nodeOrErr = await this.nodeService.get(uuid);

		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		if (!nodeOrErr.value.isAction()) {
			return left(new NodeNotFoundError(uuid));
		}

		const fileOrErr = await this.nodeService.export(uuid);
		if (fileOrErr.isLeft()) {
			return left(fileOrErr.value);
		}

		return fileToAction(fileOrErr.value);
	}

	async export(uuid: string): Promise<Either<AntboxError, File>> {
		const builtIn = builtinActions.find((a) => a.uuid === uuid);
		if (builtIn) {
			const file = new File([builtIn.toString()], builtIn.title, {
				"type": "application/javascript",
			});
			return right(file);
		}

		const nodeOrErr = await this.get(uuid);
		if (nodeOrErr.isLeft()) {
			return left(nodeOrErr.value);
		}

		return this.nodeService.export(uuid);
	}

	#ranTooManyTimes(uuid: string, uuids: string[]): boolean {
		const key = uuids.join(",");
		const timestamp = Date.now();
		const timeout = 1000 * 10; // 10 seconds
		const maxCount = 10;

		const entry = ActionService.#getRunnable([uuid, key]);

		if (entry.count >= maxCount || entry.timestamp + timeout < timestamp) {
			ActionService.#deleteRunnable([uuid, key]);
			return true;
		}

		ActionService.#incRunnable([uuid, key]);
		return false;
	}

	async #getValidNodesForAction(
		action: Action,
		uuids: string[],
	): Promise<Either<AntboxError, string[]>> {
		if (action.filters?.length < 1) {
			return right(uuids);
		}

		const nodesOrErr = await Promise.all(
			uuids.map((uuid) => this.nodeService.get(uuid)),
		);

		if (nodesOrErr.some((n) => n.isLeft())) {
			return nodesOrErr.find((n) => n.isLeft()) as Either<AntboxError, never>;
		}

		const nodes = nodesOrErr
			.map((n) => n.value as Node)
			.filter(withNodeFilters(action.filters));

		return right(nodes.map((n) => n.uuid));
	}

	async runAutomaticActionsForCreates(evt: NodeCreatedEvent) {
		const runCriteria: NodeFilter = ["runOnCreates", "==", true];

		const userOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
		if (userOrErr.isLeft()) {
			return;
		}

		const actions = await this.#getAutomaticActions(evt.payload, runCriteria);

		return this.#runActions(
			userOrErr.value,
			actions.map((a) => a.uuid),
			evt.payload.uuid,
		);
	}

	async runAutomaticActionsForUpdates(evt: NodeUpdatedEvent) {
		const runCriteria: NodeFilter = ["runOnUpdates", "==", true];

		const userOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
		if (userOrErr.isLeft()) {
			return;
		}

		const node = await this.nodeService.get(evt.payload.uuid);
		if (node.isLeft()) {
			return;
		}

		const actions = await this.#getAutomaticActions(node.value, runCriteria);
		if (actions.length === 0) {
			return;
		}

		return this.#runActions(
			userOrErr.value,
			actions.map((a) => a.uuid),
			evt.payload.uuid,
		);
	}

	#buildRunContext(aCtx: AuthContextProvider, runAs?: string): RunContext {
		const principal = new UserNodeBuilder().withUuid(aCtx.principal.uuid)
			.withEmail(aCtx.principal.email)
			.withTitle(aCtx.principal.title)
			.withGroup(runAs ?? aCtx.principal.group)
			.withGroups(aCtx.principal.groups)
			.build().value as UserNode;

		const authContext: AuthContextProvider = {
			principal,
			mode: aCtx.mode,
		};

		return {
			authContext,
			nodeService: antboxToNodeService(authContext, this.antboxService),
		};
	}

	async #getAutomaticActions(
		node: Node,
		runOnCriteria: NodeFilter,
	): Promise<Action[]> {
		const filters: NodeFilter[] = [["mimetype", "==", Node.ACTION_MIMETYPE], runOnCriteria];
		const actionsOrErr = await this.nodeService.find(filters, Number.MAX_SAFE_INTEGER);
		if (actionsOrErr.isLeft()) {
			return [];
		}

		const nodes = actionsOrErr.value.nodes as ActionNode[];

		const actionsTasks = nodes
			.filter((a) => filtersSpecFrom(a.filters).isSatisfiedBy(node))
			.map((a) => this.nodeService.export(a.uuid));

		const filesOrErrs = await Promise.all(actionsTasks);

		const actions = filesOrErrs.filter((v) => v.isRight())
			.map((v) => v.value as File)
			.map(async (v) => await fileToAction(v));

		return Promise.all(actions).then((a) =>
			a.filter((v) => v.isRight()).map((v) => v.value as Action)
		);
	}

	async runOnCreateScritps(evt: NodeCreatedEvent) {
		if (Node.isRootFolder(evt.payload.parent!)) {
			return;
		}

		const userOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
		if (userOrErr.isLeft()) {
			return;
		}

		const parentOrErr = await this.nodeService.get(evt.payload.parent!);
		if (parentOrErr.isLeft() || !parentOrErr.value.isFolder()) {
			return;
		}

		return this.#runActions(
			userOrErr.value,
			parentOrErr.value.onCreate.filter(this.#nonEmptyActions),
			evt.payload.uuid,
		);
	}

	runOnUpdatedScritps(evt: NodeUpdatedEvent) {
		return this.nodeService.get(evt.payload.uuid).then(async (node) => {
			if (node.isLeft() || Node.isRootFolder(node.value.parent)) {
				return;
			}

			const parent = await this.nodeService.get(node.value.parent);

			if (parent.isLeft() || !parent.value.isFolder()) {
				return;
			}

			const userOrErr = await this.#getAuthCtxByEmail(evt.userEmail);
			if (userOrErr.isLeft()) {
				return;
			}

			return this.#runActions(
				userOrErr.value,
				parent.value.onUpdate.filter(this.#nonEmptyActions),
				evt.payload.uuid,
			);
		});
	}

	#nonEmptyActions(uuid: string): boolean {
		return uuid?.length > 0;
	}

	#runActions(
		authContext: AuthContextProvider,
		actions: string[],
		uuid: string,
	) {
		for (const action of actions) {
			const [actionUuid, params] = action.split(" ");
			const j = `{${params ?? ""}}`;
			const g = j.replaceAll(/(\w+)=(\w+)/g, '"$1": "$2"');

			this.run(authContext, actionUuid, [uuid], JSON.parse(g)).then(
				(voidOrErr) => {
					if (voidOrErr.isLeft()) {
						console.error(voidOrErr.value.message);
					}
				},
			);
		}
	}

	async #getAuthCtxByEmail(
		userEmail: string,
	): Promise<Either<UserNotFoundError, AuthContextProvider>> {
		if (userEmail === Root.email) {
			return right({ principal: Root, mode: "Action" });
		}

		const resultOrErr = await this.nodeService.find(
			[["email", "==", userEmail], ["mimetype", "==", Node.USER_MIMETYPE]],
			1,
			1,
		);

		if (resultOrErr.isLeft()) {
			return left(resultOrErr.value);
		}

		if (resultOrErr.value.nodes.length === 0) {
			return left(new UserNotFoundError(userEmail));
		}

		const node = resultOrErr.value.nodes[0] as UserNode;
		const principal = new UserNodeBuilder()
			.withUuid(node.uuid)
			.withEmail(node.email)
			.withTitle(node.title).withGroup(node.group)
			.withGroups(node.groups)
			.build().value as UserNode;

		return right({
			principal,
			mode: "Action",
		});
	}
}
