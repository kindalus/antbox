import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";

interface WriteFileOpts {
	filename: string;
	parent: string;
}

export interface StorageProvider {
	delete(uuid: string): Promise<Either<AntboxError, void>>;
	write(uuid: string, file: File, opts?: WriteFileOpts): Promise<Either<AntboxError, void>>;
	read(uuid: string): Promise<Either<AntboxError, File>>;
}
