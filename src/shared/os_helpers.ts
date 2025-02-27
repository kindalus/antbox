export function makeTempFileSync(): string {
  const tempDir = Bun.env.TMPDIR || Bun.env.TEMP || "/tmp";
  const randomName = `temp-${Math.random().toString(36).substring(2)}`;
  const tempFilePath = `${tempDir}/${randomName}`;

  Bun.write(tempFilePath, "");

  return tempFilePath;
}

export async function writeFile(path: string, file: File): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  await Bun.write(path, arrayBuffer);
}

// export async function readFileSync(path: string) {
//   Bun.file(path);
//   Bun.write(destination, input);
// }

export async function copyFile(path: string, dst: string) {
  const data = await Bun.file(path).arrayBuffer();
  Bun.write(dst, data);
}
