import { FolderNode, Node } from "/domain/nodes/node.ts";
import { Action } from "/domain/actions/action.ts";
import { ActionRepository } from "/domain/actions/action_repository.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";

import { AuthService } from "./auth_service.ts";
import { builtinActions } from "./builtin_actions/index.ts";
import { DomainEvents } from "./domain_events.ts";
import { NodeCreatedEvent } from "/domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "/domain/nodes/node_updated_event.ts";
import { AspectService } from "./aspect_service.ts";
import { NodeService } from "./node_service.ts";

export interface ActionServiceContext {
  readonly authService: AuthService;
  readonly nodeService: NodeService;
  readonly aspectService: AspectService;
  readonly repository: ActionRepository;
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

  async createOrReplace(_principal: UserPrincipal, file: File): Promise<void> {
    const action = await this.fileToAction(file);

    this.validateAction(action);

    return this.context.repository.addOrReplace(action);
  }

  private async fileToAction(file: File): Promise<Action> {
    const url = URL.createObjectURL(file);
    const mod = await import(url);

    const raw = mod.default as Action;

    return {
      uuid: raw.uuid ?? file.name.split(".")[0],
      title: raw.title ?? file.name.split(".")[0],
      description: raw.description ?? "",
      builtIn: false,
      multiple: raw.multiple ?? false,
      aspectConstraints: raw.aspectConstraints ?? [],
      mimetypeConstraints: raw.mimetypeConstraints ?? [],
      runOnCreates: raw.runOnCreates ?? false,
      runOnUpdates: raw.runOnUpdates ?? false,
      runManually: raw.runManually ?? true,
      params: raw.params ?? [],
      run: raw.run,
    };
  }

  private validateAction(_action: Action): void {}

  async delete(_principal: UserPrincipal, uuid: string): Promise<void> {
    await this.context.repository.delete(uuid);
  }

  get(_principal: UserPrincipal, uuid: string): Promise<Action> {
    const found = builtinActions.find((a) => a.uuid === uuid);

    if (found) {
      return Promise.resolve(found);
    }

    return this.context.repository.get(uuid);
  }

  export(_principal: UserPrincipal, uuid: string): Promise<File> {
    const action = builtinActions.find((a) => a.uuid === uuid);
    if (action) {
      return Promise.resolve(
        new File([JSON.stringify(action)], `${action.uuid}.json`)
      );
    }

    return this.context.repository.getRaw(uuid);
  }

  list(_principal: UserPrincipal): Promise<Action[]> {
    return this.context.repository
      .getAll()
      .then((actions) => [
        ...(builtinActions as unknown as Action[]),
        ...actions,
      ]);
  }

  async run(
    principal: UserPrincipal,
    uuid: string,
    uuids: string[],
    params: Record<string, string>
  ): Promise<void> {
    const action = await this.get(principal, uuid);

    if (!action) {
      throw new Error(`Action ${uuid} not found`);
    }

    const error = await action.run(
      { ...this.context, principal },
      uuids,
      params
    );

    if (error) {
      throw error;
    }
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
    let actions = await this.list(this.context.authService.getSystemUser());

    actions = actions
      .filter(runOnCriteria)
      .filter(
        (a) =>
          a.mimetypeConstraints.length === 0 ||
          a.mimetypeConstraints.includes(node.mimetype)
      )
      .filter(
        (a) =>
          a.aspectConstraints.length === 0 ||
          a.aspectConstraints.some((aspect) => node.aspects?.includes(aspect))
      );

    return actions;
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
