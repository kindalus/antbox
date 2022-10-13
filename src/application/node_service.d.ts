import { AggregationFormulaError } from "/domain/nodes/aggregation_formula_error.ts";
import { FidGenerator } from "/domain/nodes/fid_generator.ts";
import { NodeRepository, NodeFilterResult } from "/domain/nodes/node_repository.ts";
import { StorageProvider } from "/domain/providers/storage_provider.ts";
import { UuidGenerator } from "/domain/providers/uuid_generator.ts";
import { Node } from "/domain/nodes/node.ts";
import { FolderNotFoundError } from "/domain/nodes/folder_not_found_error.ts";
import { SmartFolderNodeNotFoundError } from "/domain/nodes/smart_folder_node_not_found_error.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { UserPrincipal } from "/domain/auth/user_principal.ts";
import { NodeFilter } from "/domain/nodes/node_filter.ts";
import { Either } from "/shared/either.ts";
export interface NodeServiceContext {
    readonly fidGenerator?: FidGenerator;
    readonly uuidGenerator?: UuidGenerator;
    readonly storage: StorageProvider;
    readonly repository: NodeRepository;
}
export declare class NodeService {
    private readonly context;
    constructor(context: NodeServiceContext);
    createFile(principal: UserPrincipal, file: File, parent?: any): Promise<Either<FolderNotFoundError, string>>;
    private tryToCreateSmartfolder;
    createFolder(principal: UserPrincipal, title: string, parent?: any): Promise<string>;
    createMetanode(principal: UserPrincipal, title: string, parent?: any): Promise<string>;
    private createFileMetadata;
    private createFolderMetadata;
    copy(principal: UserPrincipal, uuid: string): Promise<Either<NodeNotFoundError, string>>;
    updateFile(principal: UserPrincipal, uuid: string, file: File): Promise<Either<NodeNotFoundError, void>>;
    delete(principal: UserPrincipal, uuid: string): Promise<Either<NodeNotFoundError, void>>;
    get(_principal: UserPrincipal, uuid: string): Promise<Either<NodeNotFoundError, Node>>;
    private getFromRepository;
    list(principal: UserPrincipal, parent?: any): Promise<Either<FolderNotFoundError, Node[]>>;
    folderExistsInRepo(principal: UserPrincipal, uuid: string): Promise<boolean>;
    query(_principal: UserPrincipal, filters: NodeFilter[], pageSize?: number, pageToken?: number): Promise<NodeFilterResult>;
    update(principal: UserPrincipal, uuid: string, data: Partial<Node>, merge?: boolean): Promise<Either<NodeNotFoundError, void>>;
    private merge;
    evaluate(_principal: UserPrincipal, uuid: string): Promise<Either<SmartFolderNodeNotFoundError | AggregationFormulaError, SmartFolderNodeEvaluation>>;
    private appendAggregations;
    export(principal: UserPrincipal, uuid: string): Promise<Either<NodeNotFoundError, File>>;
    private exportSmartfolder;
}
export interface SmartFolderNodeEvaluation {
    records: Node[];
    aggregations?: AggregationResult[];
}
export declare type AggregationResult = {
    title: string;
    value: unknown;
};
