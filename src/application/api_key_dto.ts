import type { ApiKeyNode } from "domain/api_keys/api_key_node";

export interface ApiKeyDTO {
  uuid?: string;
  group: string;
  owner?: string;
  description: string;
  secret: string;
}

export function nodeToApiKey(metadata: Partial<ApiKeyNode>): ApiKeyDTO {
  return {
    uuid: metadata.uuid,
    group: metadata.group,
    owner: metadata.owner,
    description: metadata.description,
    secret: metadata.secret,
  } as ApiKeyDTO;
}