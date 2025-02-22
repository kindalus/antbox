import { statSync } from "fs";

export function fileExistsSync(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch (err) {
    return false;
  }
}
