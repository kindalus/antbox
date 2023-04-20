interface WriteFileOpts {
	filename: string;
	parent: string;
}

export interface StorageProvider {
	delete(uuid: string): Promise<void>;
	write(uuid: string, file: File, opts?: WriteFileOpts): Promise<void>;
	read(uuid: string): Promise<File>;
}
