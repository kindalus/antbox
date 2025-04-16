export function makeTempFileSync(): string {
  return Deno.makeTempFileSync();
}

export async function writeFile(path: string, file: File): Promise<void> {
  const arrayBuffer = await file.bytes();
  await Deno.writeFile(path, arrayBuffer);
}

export function readFileSync(path: string): string {
  const buffer = Deno.readFileSync(path);
  return new TextDecoder().decode(buffer);
}

export async function copyFile(path: string, dst: string) {
  await Deno.copyFile(path, dst);
}

export function fileExistsSync(filePath: string): boolean {
  try {
    Deno.statSync(filePath);
    return true;
  } catch (_err: unknown) {
    return false;
  }
}
