import Aspect from "./aspect";

export default interface AspectService {
	/**
	 * Cria um novo aspecto.
	 */
	create(aspect: Aspect): Promise<void>;

	/**
	 * Apaga de forma permanente um aspecto.
	 */
	delete(uuid: string): Promise<void>;

	/**
	 * Devolve um aspecto.
	 */
	get(uuid: string): Promise<Aspect>;

	/**
	 * Lista todos os aspectos registados.
	 */
	list(): Promise<Aspect[]>;

	/**
	 * Actualiza o conteúdo de um aspecto.
	 * @param uuid
	 * @param aspect
	 */
	update(uuid: string, aspect: Aspect): Promise<void>;
}
