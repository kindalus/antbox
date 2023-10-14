import { Action } from "../domain/actions/action.ts";
import { RunContext } from "../domain/actions/run_context.ts";
import { AuthContextProvider } from "../domain/auth/auth_provider.ts";
import { UserNotFoundError } from "../domain/auth/user_not_found_error.ts";
import { getFiltersPredicate } from "../domain/nodes/filters_predicate.ts";
import { Node } from "../domain/nodes/node.ts";
import { NodeCreatedEvent } from "../domain/nodes/node_created_event.ts";
import { NodeFactory } from "../domain/nodes/node_factory.ts";
import { NodeNotFoundError } from "../domain/nodes/node_not_found_error.ts";
import { NodeUpdatedEvent } from "../domain/nodes/node_updated_event.ts";
import { AntboxError, BadRequestError, UnknownError } from "../shared/antbox_error.ts";
import { Either, left, right } from "../shared/either.ts";
import { AntboxService } from "./antbox_service.ts";
import { antboxToNodeService } from "./antbox_to_node_service.ts";
import { builtinActions } from "./builtin_actions/mod.ts";
import { Root } from "./builtin_users/root.ts";
import { NodeService } from "./node_service.ts";

export class ActionService {
	constructor(
		private readonly nodeService: NodeService,
		private readonly antboxService: AntboxService,
	) {}

	static async fileToAction(file: File): Promise<Action> {
		const url = URL.createObjectURL(file);
		const mod = await import(url);

		const raw = mod.default as Action;

		return {
			uuid: raw.uuid ?? file.name.split(".")[0],
			title: raw.title ?? file.name.split(".")[0],
			description: raw.description ?? "",
			builtIn: false,
			filters: raw.filters ?? [],
			runOnCreates: raw.runOnCreates ?? false,
			runOnUpdates: raw.runOnUpdates ?? false,
			runManually: raw.runManually ?? true,
			params: raw.params ?? [],

			run: raw.run,
		};
	}

	static actionToFile(action: Action): File {
		const text = `export default {
			uuid: "${action.uuid}",
			title: "${action.title}",
			description: "${action.description}",
			builtIn: ${action.builtIn},
			filters: ${JSON.stringify(action.filters)},
			params: ${JSON.stringify(action.params)},
			runOnCreates: ${action.runOnCreates},
			runOnUpdates: ${action.runOnUpdates},
			runManually: ${action.runManually},

			${action.run.toString()}
		};`;

		const filename = `${action.title}.js`;
		const type = Node.ACTION_MIMETYPE;

		return new File([text], filename, { type });
	}

	async get(uuid: string): Promise<Either<NodeNotFoundError, Action>> {
		const found = builtinActions.find((a) => a.uuid === uuid);

		if (found) {
			return right(found);
		}

		const [nodeError, fileOrError] = await Promise.all([
			this.nodeService.get(uuid),
			this.nodeService.export(uuid),
		]);

		if (fileOrError.isLeft()) {
			return left(fileOrError.value);
		}

		if (nodeError.isLeft()) {
			return left(nodeError.value);
		}

		if (nodeError.value.parent !== Node.ACTIONS_FOLDER_UUID) {
			return left(new NodeNotFoundError(uuid));
		}

		const file = fileOrError.value;

		return right(await ActionService.fileToAction(file));
	}

	async list(): Promise<Action[]> {
		const nodesOrErrs = await this.nodeService.list(Node.ACTIONS_FOLDER_UUID);

		if (nodesOrErrs.isLeft()) {
			console.error(nodesOrErrs.value);
			return [];
		}

		const aspectsPromises = nodesOrErrs.value.map((n) => this.get(n.uuid));

		const aspectsOrErrs = await Promise.all(aspectsPromises);
		const errs = aspectsOrErrs.filter((a) => a.isLeft());
		const aspects = aspectsOrErrs
			.filter((a) => a.isRight())
			.map((a) => a.value! as Action);

		if (errs.length > 0) {
			errs.forEach((e) => console.error(e.value));
		}

		return aspects;
	}

	async createOrReplace(
		file: File,
		_metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (file.type !== Node.ACTION_MIMETYPE) {
			return left(new BadRequestError(`Invalid mimetype: ${file.type}`));
		}

		const action = await ActionService.fileToAction(file);
		const actionFile = await ActionService.actionToFile(action);

		const metadata = NodeFactory.createFileMetadata(
			action.uuid,
			action.uuid,
			{
				title: action.title,
				description: action.description,
				parent: Node.ACTIONS_FOLDER_UUID,
			},
			Node.ACTION_MIMETYPE,
			file.size,
		);

		const nodeOrErr = await this.nodeService.get(action.uuid);
		if (nodeOrErr.isLeft()) {
			return this.nodeService.createFile(actionFile, metadata);
		}

		let voidOrErr = await this.nodeService.updateFile(action.uuid, actionFile);
		if (voidOrErr.isLeft()) {
			return left<AntboxError, Node>(voidOrErr.value);
		}

		voidOrErr = await this.nodeService.update(action.uuid, metadata);
		if (voidOrErr.isLeft()) {
			return left<AntboxError, Node>(voidOrErr.value);
		}

		return right<AntboxError, Node>(metadata);
	}

	async run(
		authContext: AuthContextProvider,
		uuid: string,
		uuids: string[],
		params: Record<string, string>,
	): Promise<Either<AntboxError, void>> {
		if (await this.#ranTooManyTimes(uuid, uuids)) {
			const message = `Action ran too many times: ${uuid}${uuids.join(",")}`;
			console.error(message);
			return left(new BadRequestError(message));
		}

		const actionOrErr = await this.get(uuid);

		if (actionOrErr.isLeft()) {
			return left(actionOrErr.value);
		}

		const action = actionOrErr.value;

		if (!action.runManually && authContext.mode === "Direct") {
			return left(new BadRequestError("Action cannot be run manually"));
		}

		const uuidsOrErr = await this.#getValidNodesForAction(
			actionOrErr.value,
			uuids,
		);

		if (uuidsOrErr.isLeft()) {
			return left(uuidsOrErr.value);
		}

		if (uuidsOrErr.value.length === 0) {
			return right(undefined);
		}

		const error = await actionOrErr.value
			.run(this.#buildRunContext(authContext), uuidsOrErr.value, params)
			.catch((e) => e);

		if (error) {
			return (error as AntboxError).errorCode
				? left(error as AntboxError)
				: left(new UnknownError(error.message));
		}

		return right(undefined);
	}

	async #ranTooManyTimes(uuid: string, uuids: string[]): Promise<boolean> {
		const kv = await Deno.openKv();
		const key = uuids.join(",");
		const timestamp = Date.now();
		const timeout = 1000 * 10; // 10 seconds
		const maxCount = 10;

		const entry = await kv.get<{ count: number; timestamp: number }>([
			uuid,
			key,
		]);

		if (!entry || !entry.value || entry.value.timestamp + timeout < timestamp) {
			await kv.set([uuid, key], { count: 1, timestamp });
			return false;
		}

		if (entry.value.count >= maxCount) {
			await kv.delete([uuid, key]);
			return true;
		}

		await kv.set([uuid, key], { count: entry.value.count + 1, timestamp });
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

		const validNodes = getFiltersPredicate(action.filters);
		const nodes = nodesOrErr.map((n) => n.value as Node).filter(validNodes);

		return right(nodes.map((n) => n.uuid));
	}

	async runAutomaticActionsForCreates(evt: NodeCreatedEvent) {
		const runCriteria = (action: Action) => action.runOnCreates || false;

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
		const runCriteria = (action: Action) => action.runOnUpdates || false;

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

	#buildRunContext(authContext: AuthContextProvider): RunContext {
		return {
			authContext,
			nodeService: antboxToNodeService(authContext, this.antboxService),
		};
	}

	async #getAutomaticActions(
		node: Node,
		runOnCriteria: (action: Action) => boolean,
	): Promise<Action[]> {
		const actions = await this.list();

		return actions.filter(runOnCriteria).filter((a) => {
			if (a.filters.length === 0) {
				return true;
			}

			return getFiltersPredicate(a.filters)(node);
		});
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

		const resultOrErr = await this.nodeService.query(
			[["properties.email", "==", userEmail]],
			1,
		);

		if (resultOrErr.isLeft()) {
			return left(resultOrErr.value);
		}

		if (resultOrErr.value.nodes.length === 0) {
			return left(new UserNotFoundError(userEmail));
		}

		const node = resultOrErr.value.nodes[0];

		return right({
			principal: {
				email: userEmail,
				fullname: node.title,
				group: node.properties["user:group"] as unknown as string,
				groups: (node.properties["user:groups"] as unknown as string[]) ?? [],
			},
			mode: "Action",
		});
	}
}
