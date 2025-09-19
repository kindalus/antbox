import { Constructor } from "domain/nodes/mixins.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";

export function ActionMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    protected _runOnCreates: boolean;
    protected _runOnUpdates: boolean;
    protected _runManually: boolean;
    protected _filters: NodeFilter[];

    constructor(...args: any[]) {
      super(...args);
      this._runOnCreates = args[0].runOnCreates || false;
      this._runOnUpdates = args[0].runOnUpdates || false;
      this._runManually = args[0].runManually || false;
      this._filters = args[0].filters || [];
    }

    get runOnCreates() {
      return this._runOnCreates;
    }

    get runOnUpdates() {
      return this._runOnUpdates;
    }

    get runManually() {
      return this._runManually;
    }

    get filters() {
      return this._filters;
    }
  };
}
