import { FolderNode } from "./folder_node.ts";

export class Folders {
  static ROOT_FOLDER_UUID = "--root--";
  static USERS_FOLDER_UUID = "--users--";
  static GROUPS_FOLDER_UUID = "--groups--";
  static ASPECTS_FOLDER_UUID = "--aspects--";
  static ACTIONS_FOLDER_UUID = "--actions--";
  static EXT_FOLDER_UUID = "--ext--";
  static SYSTEM_FOLDER_UUID = "--system--";
  static API_KEYS_FOLDER_UUID = "--api-keys--";

  static SYSTEM_FOLDERS_UUID = [
    Folders.USERS_FOLDER_UUID,
    Folders.GROUPS_FOLDER_UUID,
    Folders.ASPECTS_FOLDER_UUID,
    Folders.ACTIONS_FOLDER_UUID,
    Folders.EXT_FOLDER_UUID,
    Folders.SYSTEM_FOLDER_UUID,
    Folders.API_KEYS_FOLDER_UUID,
  ];

  static isRootFolder(node: FolderNode): boolean {
    return node.uuid === Folders.ROOT_FOLDER_UUID;
  }

  static isSystemRootFolder(node: FolderNode): boolean {
    return node.uuid === Folders.SYSTEM_FOLDER_UUID;
  }

  static isAspectsFolder(node: FolderNode): boolean {
    return node.uuid === Folders.ASPECTS_FOLDER_UUID;
  }

  static isActionsFolder(node: FolderNode): boolean {
    return node.uuid === Folders.ACTIONS_FOLDER_UUID;
  }

  static isApiKeysFolder(node: FolderNode): boolean {
    return node.uuid === Folders.API_KEYS_FOLDER_UUID;
  }

  static isSystemFolder(uuid: string): boolean {
    return Folders.SYSTEM_FOLDERS_UUID.some((folder) => folder === uuid);
  }

  private constructor() {}
}
