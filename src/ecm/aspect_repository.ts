import Aspect from  "./aspect";

export default interface AspectRepository {
	delete(uuid: string): Promise<void>;
	addOrReplace(aspect: Aspect): Promise<void>;
	get(uuid: string): Promise<Aspect>;
	getAll(): Promise<Aspect[]>;
}