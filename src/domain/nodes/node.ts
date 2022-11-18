import { ValidationError } from "./validation_error.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";

export type Properties = Record<string, unknown>;

export class Node {
  static FOLDER_MIMETYPE = "application/vnd.antbox.folder";
  static META_NODE_MIMETYPE = "application/vnd.antbox.metanode";
  static SMART_FOLDER_MIMETYPE = "application/vnd.antbox.smartfolder";
  static ROOT_FOLDER_UUID = "--root--";
  static ACTIONS_FOLDER_UUID = "--actions--";
  static ASPECTS_FOLDER_UUID = "--aspects--";
  static EXT_FOLDER_UUID = "--ext--";
  static SYSTEM_FOLDER_UUID = "--system--";

  private static FID_PREFIX = "fid--";

  static fidToUuid(fid: string): string {
    return `${Node.FID_PREFIX}${fid}`;
  }

  static isFid(uuid: string): boolean {
    return uuid?.startsWith(Node.FID_PREFIX);
  }

  static uuidToFid(fid: string): string {
    return fid?.startsWith(Node.FID_PREFIX)
      ? fid.substring(Node.FID_PREFIX.length)
      : fid;
  }

  static isRootFolder(uuid: string): boolean {
    return uuid === Node.ROOT_FOLDER_UUID;
  }

  static rootFolder(): FolderNode {
    const root = new FolderNode();
    root.uuid = Node.ROOT_FOLDER_UUID;
    root.fid = Node.ROOT_FOLDER_UUID;
    root.title = "";
    return root;
  }

  uuid = "";
  fid = "";
  title = "";
  description?: string;
  mimetype = "";
  size = 0;
  aspects?: string[];
  parent = Node.ROOT_FOLDER_UUID;
  createdTime = "";
  modifiedTime = "";
  owner = "";
  properties?: Properties;

  constructor() {
    this.createdTime = this.modifiedTime = new Date().toISOString();
    this.mimetype = Node.SMART_FOLDER_MIMETYPE;
  }

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

  isSystemFolder(): boolean {
    return Node.isSystemFolder(this.uuid);
  }

  static isSystemFolder(uuid: string): boolean {
    return (
      uuid === Node.SYSTEM_FOLDER_UUID ||
      uuid === Node.ASPECTS_FOLDER_UUID ||
      uuid === Node.ACTIONS_FOLDER_UUID ||
      uuid === Node.EXT_FOLDER_UUID
    );
  }

  validate(
    _uuidsGetter: (aspectUuid: string) => Promise<string[]>
  ): Promise<ValidationError[]> {
    return Promise.resolve([]);
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
