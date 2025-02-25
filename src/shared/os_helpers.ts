declare namespace Deno {
  export function makeTempFileSync(): string;
  export function writeFile(path: string, data: ReadableStream): Promise<void>;
}

export function makeTempFileSync(): string {
  return Deno.makeTempFileSync();
}

export async function writeFile(path: string, file: File): Promise<void> {
  await Deno.writeFile(path, file.stream());
}

// export async function readFileSync(path: string) {
//   Bun.file(path);
//   Bun.write(destination, input);
// }

export async function copyFile(path: string, dst: string) {
  const data = await Bun.file(path).arrayBuffer();
  Bun.write(dst, data);
}
