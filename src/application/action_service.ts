import { left, right } from "/shared/either.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { Node } from "/domain/nodes/node.ts";
import { FolderNode } from "/domain/nodes/folder_node.ts";
import {
	Action,
	RunContext,
	SecureAspectService,
	SecureNodeService,
} from "/domain/actions/action.ts";

import { builtinActions } from "./builtin_actions/index.ts";
import { NodeCreatedEvent } from "/domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "/domain/nodes/node_updated_event.ts";
import { AspectService } from "./aspect_service.ts";
import { NodeService } from "./node_service.ts";
import { getNodeFilterPredicate } from "/domain/nodes/node_filter_predicate.ts";
import { Either } from "/shared/either.ts";
import { NodeFactory } from "/domain/nodes/node_factory.ts";
import { AntboxError, BadRequestError } from "/shared/antbox_error.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { UserNotFoundError } from "/domain/auth/user_not_found_error.ts";

export interface ActionServiceContext {
	readonly nodeService: NodeService;
	readonly aspectService: AspectService;
	readonly secureNodeService: NodeService;
	readonly secureAspectService: AspectService;
}

export class ActionService {
	static ACTIONS_FOLDER_UUID = "--actions--";

	static isActionsFolder(uuid: string): boolean {
		return uuid === ActionService.ACTIONS_FOLDER_UUID;
	}

	constructor(
		private readonly nodeService: NodeService,
		private readonly secureNodeService: SecureNodeService,
		private readonly secureAspectService: SecureAspectService,
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

	static actionToFile(action: Action): Promise<File> {
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
  readonly authService: AuthService;
    
    ${action.run.toString()}
	};
`;

		const filename = `${action.title}.js`;
		const type = "application/javascript";

		return Promise.resolve(new File([text], filename, { type }));
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

		if (nodeError.value.parent !== ActionService.ACTIONS_FOLDER_UUID) {
			return left(new NodeNotFoundError(uuid));
		}

		const file = fileOrError.value;

		return right(await ActionService.fileToAction(file));
	}

	list(): Promise<Action[]> {
		return this.nodeService
			.list(ActionService.ACTIONS_FOLDER_UUID)
			.then((nodesOrErrs) => nodesOrErrs.value as Node[])
			.then((nodes) => nodes.map((n) => this.get(n.uuid)))
			.then((actionPromises) => Promise.all(actionPromises))
			.then((actionsOrErrs) => actionsOrErrs.map((a) => a.value as Action));
	}

	async createOrReplace(
		file: File,
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		if (!ActionService.isActionsFolder(metadata.parent!)) {
			return left(
				new BadRequestError("Must be in the actions folder"),
			);
		}

		if (!Node.isJavascript(file)) {
			return left(
				new BadRequestError("File must be a javascript file"),
			);
		}

		const uuid = this.nodeService.uuidGenerator.generate();

		const fileNode = NodeFactory.createFileMetadata(
			uuid,
			this.nodeService.fidGenerator.generate(uuid),
			{ ...metadata, parent: ActionService.ACTIONS_FOLDER_UUID },
			file.type,
			file.size,
		);
		const action = await ActionService.fileToAction(file);

		fileNode.uuid = action.uuid;
		fileNode.title = action.title;
		fileNode.fid = action.uuid;

		await this.nodeService.storage.write(
			fileNode.uuid,
			await ActionService.actionToFile(action),
		);
		await this.nodeService.repository.add(fileNode);

		return right(fileNode);
	}

	async run(
		principal: UserPrincipal,
		uuid: string,
		uuids: string[],
		params: Record<string, string>,
	): Promise<Either<NodeNotFoundError | Error, void>> {
		const actionOrErr = await this.get(uuid);

		if (actionOrErr.isLeft()) {
			return left(actionOrErr.value);
		}

		const error = await actionOrErr.value.run(
			this.#buildRunContext(principal),
			uuids,
			params,
		);

		if (error) {
			return left(error);
		}

		return right(undefined);
	}

	async runAutomaticActionsForCreates(evt: NodeCreatedEvent) {
		const runCriteria = (action: Action) => action.runOnCreates || false;

		const userPrincipalOrErr = await this.#getPrincipalByEmail(evt.userEmail);
		if (userPrincipalOrErr.isLeft()) {
			return;
		}

		const actions = await this.#getAutomaticActions(evt.payload, runCriteria);

		return this.#runActions(
			userPrincipalOrErr.value,
			actions.map((a) => a.uuid),
			evt.payload.uuid,
		);
	}

	async runAutomaticActionsForUpdates(evt: NodeUpdatedEvent) {
		const runCriteria = (action: Action) => action.runOnUpdates || false;

		const userPrincipalOrErr = await this.#getPrincipalByEmail(evt.userEmail);
		if (userPrincipalOrErr.isLeft()) {
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
			userPrincipalOrErr.value,
			actions.map((a) => a.uuid),
			evt.payload.uuid,
		);
	}

	#buildRunContext(principal: UserPrincipal): RunContext {
		return {
			authContext: {
				getPrincipal: () => principal,
			},
			nodeService: this.secureNodeService,
			aspectService: this.secureAspectService,
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

			return getNodeFilterPredicate(a.filters)(node);
		});
	}

	async runOnCreateScritps(evt: NodeCreatedEvent) {
		if (Node.isRootFolder(evt.payload.parent!)) {
			return;
		}

		const userPrincipalOrErr = await this.#getPrincipalByEmail(evt.userEmail);
		if (userPrincipalOrErr.isLeft()) {
			return;
		}

		const parentOrErr = await this.nodeService.get(evt.payload.parent!);
		if (parentOrErr.isLeft()) {
			return;
		}

		return this.#runActions(
			userPrincipalOrErr.value,
			(parentOrErr.value as FolderNode).onCreate.filter(this.#nonEmptyActions),
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

			const userPrincipalOrErr = await this.#getPrincipalByEmail(evt.userEmail);
			if (userPrincipalOrErr.isLeft()) {
				return;
			}

			return this.#runActions(
				userPrincipalOrErr.value,
				parent.value.onUpdate.filter(this.#nonEmptyActions),
				evt.payload.uuid,
			);
		});
	}

	#nonEmptyActions(uuid: string): boolean {
		return uuid?.length > 0;
	}

	#runActions(principal: UserPrincipal, actions: string[], uuid: string) {
		for (const action of actions) {
			const [actionUuid, params] = action.split(" ");
			const j = `{${params ?? ""}}`;
			const g = j.replaceAll(/(\w+)=(\w+)/g, '"$1": "$2"');

			return this.run(principal, actionUuid, [uuid], JSON.parse(g));
		}
	}

	async #getPrincipalByEmail(
		userEmail: string,
	): Promise<Either<UserNotFoundError, UserPrincipal>> {
		const resultOrErr = await this.nodeService.query(
			[["properties.email", "==", userEmail]],
			1,
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
			email: userEmail,
			fullname: node.title,
			group: node.properties["user:group"] as unknown as string,
			groups: (node.properties["user:groups"] as unknown as string[]) ?? [],
		});
	}
}
