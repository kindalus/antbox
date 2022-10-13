import { SmartFolderNode } from "./smart_folder_node.ts";

export type Properties = Record<string, unknown>;

export class Node {
  static FOLDER_MIMETYPE = "application/folder";
  static META_NODE_MIMETYPE = "application/metanode";
  static SMART_FOLDER_MIMETYPE = "application/smartfolder";
  static ROOT_FOLDER_UUID = "ROOT";

  static fidToUuid(fid: string): string {
    return `fid:${fid}`;
  }

  static isFid(uuid: string): boolean {
    return uuid?.startsWith("fid:");
  }

  static uuidToFid(fid: string): string {
    return fid?.startsWith("fid:") ? fid.substring(4) : fid;
  }

  static isRootFolder(uuid: string): boolean {
    return uuid === Node.ROOT_FOLDER_UUID;
  }

  uuid = "";
  fid = "";
  title = "";
  description?: string;
  mimetype = "";
  size = 0;
  starred = false;
  trashed = false;
  aspects?: string[];
  parent = Node.ROOT_FOLDER_UUID;
  createdTime = "";
  modifiedTime = "";
  owner = "";
  properties?: Properties;

  isJson(): boolean {
    return this.mimetype === "application/json";
  }

  isFolder(): this is FolderNode {
    return this.mimetype === Node.FOLDER_MIMETYPE;
  }

  isMetaNode(): boolean {
    return this.mimetype === Node.META_NODE_MIMETYPE;
  }

  isSmartFolder(): this is SmartFolderNode {
    return this.mimetype === Node.SMART_FOLDER_MIMETYPE;
  }

  isFile(): boolean {
    return !this.isFolder() && !this.isSmartFolder() && !this.isMetaNode();
  }
}

export class FolderNode extends Node {
  onCreate: string[] = [];
  onUpdate: string[] = [];
}

export class FileNode extends Node {
  // Versões têm o formato aaaa-MM-ddTHH:mm:ss
  versions: string[] = [];
}
