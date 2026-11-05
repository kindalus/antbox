import fs from "node:fs/promises";
import fsSync from "node:fs";
import { tmpdir } from "node:os";
import { tempPath } from "./temp_path.ts";

export function makeTempFileSync(): string {
	const path = tempPath(tmpdir(), "antbox-");
	fsSync.writeFileSync(path, "", { flag: "wx", mode: 0o600 });
	return path;
}

export async function writeFile(path: string, file: File): Promise<void> {
	const arrayBuffer = await file.bytes();
	await fs.writeFile(path, arrayBuffer);
}

export function readFileSync(path: string): string {
	const buffer = fsSync.readFileSync(path);
	return new TextDecoder().decode(buffer);
}

export async function copyFile(path: string, dst: string) {
	await fs.copyFile(path, dst);
}

export function fileExistsSync(filePath: string): boolean {
	try {
		fsSync.statSync(filePath);
		return true;
	} catch (_err: unknown) {
		return false;
	}
}
