import { left, right } from "/shared/either.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { FolderNode, Node } from "/domain/nodes/node.ts";
import { Action } from "/domain/actions/action.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";

import { AuthService } from "./auth_service.ts";
import { builtinActions } from "./builtin_actions/index.ts";
import { DomainEvents } from "./domain_events.ts";
import { NodeCreatedEvent } from "/domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "/domain/nodes/node_updated_event.ts";
import { AspectService } from "./aspect_service.ts";
import { NodeService } from "./node_service.ts";
import { getNodeFilterPredicate } from "../domain/nodes/node_filter_predicate.ts";
import { Either } from "../shared/either.ts";

export interface ActionServiceContext {
  readonly authService: AuthService;
  readonly nodeService: NodeService;
  readonly aspectService: AspectService;
}

export class ActionService {
  private readonly context: ActionServiceContext;

  constructor(context: ActionServiceContext) {
    this.context = context;

    DomainEvents.subscribe(NodeCreatedEvent.EVENT_ID, {
      handle: (evt) => this.runOnCreateScritps(evt as NodeCreatedEvent),
    });

    DomainEvents.subscribe(NodeUpdatedEvent.EVENT_ID, {
      handle: (evt) => this.runOnUpdatedScritps(evt as NodeUpdatedEvent),
    });

    DomainEvents.subscribe(NodeCreatedEvent.EVENT_ID, {
      handle: (evt) =>
        this.runAutomaticActionsForCreates(evt as NodeCreatedEvent),
    });

    DomainEvents.subscribe(NodeUpdatedEvent.EVENT_ID, {
      handle: (evt) =>
        this.runAutomaticActionsForUpdates(evt as NodeUpdatedEvent),
    });
  }

  static async fileToAction(file: File): Promise<Action> {
    const url = URL.createObjectURL(file);
    const mod = await import(url);

    const raw = mod.default as Action;

    return {
      uuid: raw.uuid ?? file.name.split(".")[0],
      title: raw.title ?? file.name.split(".")[0],
      description: raw.description ?? "",
      builtIn: false,
      multiple: raw.multiple ?? false,
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
		multiple: ${action.multiple},
		filters: ${JSON.stringify(action.filters)},
		params: ${JSON.stringify(action.params)},
    runOnCreates: ${action.runOnCreates},
    runOnUpdates: ${action.runOnUpdates},
    runManually: ${action.runManually},
    
    ${action.run.toString()}
	};
`;

    const filename = `${action.title}.js`;
    const type = "text/javascript";

    return Promise.resolve(new File([text], filename, { type }));
  }

  async get(
    principal: UserPrincipal,
    uuid: string
  ): Promise<Either<NodeNotFoundError, Action>> {
    const found = builtinActions.find((a) => a.uuid === uuid);

    if (found) {
      return right(found);
    }

    const [nodeError, fileOrError] = await Promise.all([
      this.context.nodeService.get(principal, uuid),
      this.context.nodeService.export(principal, uuid),
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

  list(principal: UserPrincipal): Promise<Action[]> {
    return this.context.nodeService
      .list(principal, Node.ACTIONS_FOLDER_UUID)
      .then((nodesOrErrs) => nodesOrErrs.value as Node[])
      .then((nodes) => nodes.map((n) => this.get(principal, n.uuid)))
      .then((actionPromises) => Promise.all(actionPromises))
      .then((actionsOrErrs) => actionsOrErrs.map((a) => a.value as Action));
  }

  async run(
    principal: UserPrincipal,
    uuid: string,
    uuids: string[],
    params: Record<string, string>
  ): Promise<Either<NodeNotFoundError | Error, void>> {
    const actionOrErr = await this.get(principal, uuid);

    if (actionOrErr.isLeft()) {
      return left(actionOrErr.value);
    }

    const error = await actionOrErr.value.run(
      { ...this.context, principal },
      uuids,
      params
    );

    if (error) {
      return left(error);
    }

    return right(undefined);
  }

  runAutomaticActionsForCreates(evt: NodeCreatedEvent) {
    const runCriteria = (action: Action) => action.runOnCreates || false;

    return this.getAutomaticActions(evt.payload, runCriteria).then(
      (actions) => {
        return this.runActions(
          actions.map((a) => a.uuid),
          evt.payload.uuid
        );
      }
    );
  }

  runAutomaticActionsForUpdates(evt: NodeUpdatedEvent) {
    const runCriteria = (action: Action) => action.runOnUpdates || false;

    return this.context.nodeService
      .get(this.context.authService.getSystemUser(), evt.payload.uuid)
      .then(async (node) => {
        if (node.isLeft()) {
          return;
        }

        const actions = await this.getAutomaticActions(node.value, runCriteria);
        if (actions.length === 0) {
          return;
        }

        return this.runActions(
          actions.map((a) => a.uuid),
          evt.payload.uuid
        );
      });
  }

  private async getAutomaticActions(
    node: Node,
    runOnCriteria: (action: Action) => boolean
  ): Promise<Action[]> {
    const actions = await this.list(this.context.authService.getSystemUser());

    return actions.filter(runOnCriteria).filter((a) => {
      if (a.filters.length === 0) {
        return true;
      }

      return getNodeFilterPredicate(a.filters)(node);
    });
  }

  runOnCreateScritps(evt: NodeCreatedEvent) {
    if (Node.isRootFolder(evt.payload.parent!)) {
      return;
    }

    return this.context.nodeService
      .get(this.context.authService.getSystemUser(), evt.payload.parent!)
      .then((parent) => {
        if (parent.isLeft()) {
          return;
        }

        return this.runActions(
          (parent.value as FolderNode).onCreate.filter(this.nonEmptyActions),
          evt.payload.uuid
        );
      });
  }

  runOnUpdatedScritps(evt: NodeUpdatedEvent) {
    return this.context.nodeService
      .get(this.context.authService.getSystemUser(), evt.payload.uuid)
      .then(async (node) => {
        if (node.isLeft() || Node.isRootFolder(node.value.parent)) {
          return;
        }

        const parent = await this.context.nodeService.get(
          this.context.authService.getSystemUser(),
          node.value.parent
        );

        if (parent.isLeft() || !parent.value.isFolder()) {
          return;
        }

        return this.runActions(
          parent.value.onUpdate.filter(this.nonEmptyActions),
          evt.payload.uuid
        );
      });
  }

  private nonEmptyActions(uuid: string): boolean {
    return uuid?.length > 0;
  }

  private runActions(actions: string[], uuid: string) {
    for (const action of actions) {
      const [actionUuid, params] = action.split(" ");
      const j = `{${params ?? ""}}`;
      const g = j.replaceAll(/(\w+)=(\w+)/g, '"$1": "$2"');

      return this.run(
        this.context.authService.getSystemUser(),
        actionUuid,
        [uuid],
        JSON.parse(g)
      );
    }
  }
}
