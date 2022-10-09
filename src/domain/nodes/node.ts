export const FOLDER_MIMETYPE = "application/folder";
export const SMART_FOLDER_MIMETYPE = "application/smartfolder";
export const META_NODE_MIMETYPE = "application/metanode";
export const ROOT_FOLDER_UUID = "ROOT";

export type Properties = Record<string, unknown>;

export interface Node extends Record<string, unknown> {
  uuid: string;
  fid: string;
  title: string;
  description?: string;
  mimetype: string;
  size: number;
  starred: boolean;
  trashed: boolean;
  aspects?: string[];
  parent?: string;
  createdTime: string;
  modifiedTime: string;
  owner: string;
  properties?: Properties;
}

export interface FolderNode extends Node {
  onCreate: string[];
  onUpdate: string[];
}

export interface FileNode extends Node {
  // Versões têm o formato aaaa-MM-ddTHH:mm:ss
  versions: string[];
}

export function isFid(uuid: string): boolean {
  return uuid.startsWith("fid:");
}

export function uuidToFid(fid: string): string {
  return fid.startsWith("fid:") ? fid.substring(4) : fid;
}

export function fidToUuid(fid: string): string {
  return `fid:${fid}`;
}
