import { Constructor } from "domain/nodes/mixins.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";




export function ActionMixin<TBase extends Constructor>(Base: TBase) {
return class extends Base {
  #runOnCreates: boolean;
  #runOnUpdates: boolean;
  #runManually: boolean;
  #filters: NodeFilter[];


  constructor(...args: any[]) {
    super(...args);
    this.#runOnCreates = args[0].runOnCreates || false;
    this.#runOnUpdates = args[0].runOnUpdates || false;
    this.#runManually = args[0].runManually || false;
    this.#filters = args[0].filters || [];
  }

  get runOnCreates() {
    return this.#runOnCreates;
  }

  get runOnUpdates() {
    return this.#runOnUpdates;
  }

  get runManually() {
    return this.#runManually;
  }

  get filters() {
    return this.#filters;
  }
}
