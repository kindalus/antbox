import Action from "./action.ts";

export default interface ActionRepository {
	delete(uuid: string): Promise<void>;
	addOrReplace(Action: Action): Promise<void>;
	get(uuid: string): Promise<Action>;
	getAll(): Promise<Action[]>;
	getPath(uuid: string): Promise<string>;
}
