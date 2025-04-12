export function fileExistsSync(filePath: string): boolean {
  try {
    Deno.statSync(filePath);
    return true;
  } catch (_err: unknown) {
    return false;
  }
}
