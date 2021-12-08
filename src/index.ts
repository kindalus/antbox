import { AspectProperty, Aspect } from "./ecm/aspect";
import { AspectService } from "./ecm/aspect_service";
import EcmRegistry, { EcmConfig } from "./ecm/ecm_registry";

import {
	NodeFilterResult,
	SmartFolderNodeEvaluation, NodeService
} from "./ecm/node_service";

import {
	fidToUuid,
	FileNode,
	FolderNode,
	FOLDER_MIMETYPE,
	NodeFilter,
	Properties,
	ROOT_FOLDER_UUID,
	SmartFolderNode,
	SMART_FOLDER_MIMETYPE, Node
} from "./ecm/node";

import { AuthService } from "./ecm/auth_service";
import { WebContent } from "./ecm/builtin_aspects/web_content";
import { RequestContext } from "./ecm/request_context";


import * as ecm from "./ecm";

function configureServer(ecmConfig: EcmConfig) {
	return EcmRegistry.buildIfNone(ecmConfig);
}



export {
	FOLDER_MIMETYPE,
	ROOT_FOLDER_UUID,
	SmartFolderNode,
	SMART_FOLDER_MIMETYPE,
	fidToUuid,
	AuthService,
	Aspect,
	AspectProperty,
	AspectService,
	EcmConfig,
	EcmRegistry,
	FileNode,
	FolderNode,
	Node,
	NodeFilter,
	NodeFilterResult,
	NodeService,
	RequestContext,
	Properties,
	SmartFolderNodeEvaluation,
	WebContent,
	configureServer,
	
};
