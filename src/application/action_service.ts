import Action, {
  AspectServiceForActions,
  NodeServiceForActions,
} from "/domain/actions/action.ts";
import ActionRepository from "/domain/actions/action_repository.ts";
import Principal from "/domain/auth/principal.ts";

import AuthService from "./auth_service.ts";
import builtin from "./builtin_actions/index.js";

export interface ActionServiceContext {
  readonly authService: AuthService;
  readonly nodeService: NodeServiceForActions;
  readonly aspectService: AspectServiceForActions;
  readonly repository: ActionRepository;
}

export default class ActionService {
  private readonly context: ActionServiceContext;

  constructor(context: ActionServiceContext) {
    this.context = context;
  }

  create(principal: UserPrincipal, action: Action): Promise<void> {
    this.validateAction(action);

    return this.context.repository.addOrReplace(action);
  }

  update(
    principal: UserPrincipal,
    uuid: string,
    action: Action
  ): Promise<void> {
    return this.create(principal, { ...action, uuid });
  }

  private validateAction(_action: Action): void {}

  async delete(principal: UserPrincipal, uuid: string): Promise<void> {
    await this.context.repository.delete(uuid);
  }

  get(principal: UserPrincipal, uuid: string): Promise<Action> {
    return this.context.repository.get(uuid);
  }

  list(principal: UserPrincipal): Promise<Action[]> {
    return this.context.repository
      .getAll()
      .then((actions) => [...(builtin as unknown as Action[]), ...actions]);
  }

  async run(
    principal: UserPrincipal,
    uuid: string,
    params: Record<string, unknown>,
    uuids: string[]
  ): Promise<void> {
    const action = await this.get(principal, uuid);

    if (!action) {
      throw new Error(`Action ${uuid} not found`);
    }

    const error = await action.run(
      { ...this.context, principal },
      params,
      uuids
    );

    if (error) {
      throw error;
    }
  }
}
