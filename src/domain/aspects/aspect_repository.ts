import Aspect from "./aspect.ts";

export default interface AspectRepository {
	delete(uuid: string): Promise<void>;
	addOrReplace(aspect: Aspect): Promise<void>;
	get(uuid: string): Promise<Aspect>;
	getAll(): Promise<Aspect[]>;
}
