export interface Actions {
	uuid: string;
	title: string;
	description: string;
	body: string;
	builtIn: boolean;
	multiple: string;
	aspectConstraints: string[];
	mimetypeConstraints: string[];
	params: ActionsParams[];
}
export interface ActionsParams {
	name: string;
	title: string;
	type: string;
	required: boolean;
	validationRegex?: string;
	validationList?: string[];
}

export interface ActionsQueryResult {
	pageToken: number;
	pageSize: number;
	pageCount: number;
	actions: Array<Actions>;
}

export interface ActionsBuiltInQueryResult {
	folderActions: [];
	fileActions: [];
}
