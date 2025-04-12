export function makeTempFileSync(): string {
  return Deno.makeTempFileSync();
}

export async function writeFile(path: string, file: File): Promise<void> {
  const arrayBuffer = await file.bytes();
  await Deno.writeFile(path, arrayBuffer);
}

// export async function readFileSync(path: string) {
//   Bun.file(path);
//   Bun.write(destination, input);
// }

export async function copyFile(path: string, dst: string) {
  await Deno.copyFile(path, dst);
}
