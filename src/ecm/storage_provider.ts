export interface StorageProvider {
	delete(uuid: string): Promise<void>;
	write(uuid: string, file: Blob): Promise<void>;
	read(uuid: string): Promise<Blob>;
}
