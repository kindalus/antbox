import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import type { NodeFilter } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";

function buildRootFolder(): FolderNode {
  return FolderNode.create({
    uuid: Folders.ROOT_FOLDER_UUID,
    fid: Folders.ROOT_FOLDER_UUID,
    title: "Root",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: Users.ROOT_USER_EMAIL,
    group: Groups.ADMINS_GROUP_UUID,
    filters: [["mimetype", "in", [
      Nodes.FOLDER_MIMETYPE,
      Nodes.SMART_FOLDER_MIMETYPE,
    ]]],
    permissions: {
      group: ["Read", "Write", "Export"],
      authenticated: ["Read"],
      anonymous: [],
      advanced: {},
    },
  }).right;
}

function buildSystemFolder(): FolderNode {
  return FolderNode.create(
    createSystemFolderMetadata(
      Folders.SYSTEM_FOLDER_UUID,
      Folders.SYSTEM_FOLDER_UUID,
      "__System__",
      Folders.ROOT_FOLDER_UUID,
    ),
  ).right;
}

function buildAspectsFolder(): FolderNode {
  const metadata = createSystemFolderMetadata(
    Folders.ASPECTS_FOLDER_UUID,
    Folders.ASPECTS_FOLDER_UUID,
    "Aspects",
    Folders.SYSTEM_FOLDER_UUID,
  );

  metadata.permissions = {
    group: ["Read"],
    authenticated: [],
    anonymous: [],
    advanced: {},
  };

  return FolderNode.create(metadata).right;
}

function buildUsersFolder(): FolderNode {
  return FolderNode.create(
    createSystemFolderMetadata(
      Folders.USERS_FOLDER_UUID,
      Folders.USERS_FOLDER_UUID,
      "Users",
      Folders.SYSTEM_FOLDER_UUID,
    ),
  ).right;
}

function buildGroupsFolder(): FolderNode {
  return FolderNode.create(
    createSystemFolderMetadata(
      Folders.GROUPS_FOLDER_UUID,
      Folders.GROUPS_FOLDER_UUID,
      "Groups",
      Folders.SYSTEM_FOLDER_UUID,
    ),
  ).right;
}

function buildApiKeysFolder(): FolderNode {
  return FolderNode.create(
    createSystemFolderMetadata(
      Folders.API_KEYS_FOLDER_UUID,
      Folders.API_KEYS_FOLDER_UUID,
      "API Keys",
      Folders.SYSTEM_FOLDER_UUID,
    ),
  ).right;
}

function buildFeaturesFolder(): FolderNode {
  return FolderNode.create(
    createSystemFolderMetadata(
      Folders.FEATURES_FOLDER_UUID,
      Folders.FEATURES_FOLDER_UUID,
      "Features",
      Folders.SYSTEM_FOLDER_UUID,
    ),
  ).right;
}

function createSystemFolderMetadata(
  uuid: string,
  fid: string,
  title: string,
  parent: string,
): Partial<NodeMetadata> {
  const filters: NodeFilter[] = [];

  switch (uuid) {
    case Folders.ROOT_FOLDER_UUID:
      filters.push(["mimetype", "==", Nodes.FOLDER_MIMETYPE]);
      break;
    case Folders.ASPECTS_FOLDER_UUID:
      filters.push(["mimetype", "==", Nodes.ASPECT_MIMETYPE]);
      break;
    case Folders.USERS_FOLDER_UUID:
      filters.push(["mimetype", "==", Nodes.USER_MIMETYPE]);
      break;
    case Folders.GROUPS_FOLDER_UUID:
      filters.push(["mimetype", "==", Nodes.GROUP_MIMETYPE]);
      break;
    case Folders.API_KEYS_FOLDER_UUID:
      filters.push(["mimetype", "==", Nodes.API_KEY_MIMETYPE]);
      break;
    case Folders.FEATURES_FOLDER_UUID:
      filters.push(["mimetype", "==", Nodes.FEATURE_MIMETYPE]);
      break;
  }

  return {
    uuid,
    fid,
    title,
    parent,
    owner: Users.ROOT_USER_EMAIL,
    group: Groups.ADMINS_GROUP_UUID,
    permissions: {
      group: ["Read", "Write", "Export"],
      authenticated: [],
      anonymous: [],
      advanced: {},
    },
    filters,
  };
}

const ASPECTS_FOLDER = buildAspectsFolder();
const USERS_FOLDER = buildUsersFolder();
const GROUPS_FOLDER = buildGroupsFolder();
const SYSTEM_FOLDER = buildSystemFolder();
const API_KEYS_FOLDER = buildApiKeysFolder();
const FEATURES_FOLDER = buildFeaturesFolder();

const ROOT_FOLDER = buildRootFolder();

const SYSTEM_FOLDERS = [
  ASPECTS_FOLDER,
  USERS_FOLDER,
  GROUPS_FOLDER,
  API_KEYS_FOLDER,
  FEATURES_FOLDER,
];

export {
  API_KEYS_FOLDER,
  ASPECTS_FOLDER,
  FEATURES_FOLDER,
  GROUPS_FOLDER,
  ROOT_FOLDER,
  SYSTEM_FOLDER,
  SYSTEM_FOLDERS,
  USERS_FOLDER,
};

export const builtinFolders: FolderNode[] = [
  API_KEYS_FOLDER,
  ASPECTS_FOLDER,
  FEATURES_FOLDER,
  GROUPS_FOLDER,

  SYSTEM_FOLDER,
  USERS_FOLDER,
  ROOT_FOLDER,
];
