export class Group {
	static readonly ADMINS_GROUP_UUID = "--admins--";
	static readonly ANONYMOUS_GROUP_UUID = "--anonymous--";

	constructor() {
		this.uuid = null as unknown as string;
		this.title = null as unknown as string;
		this.description = null as unknown as string;
		this.fid = null as unknown as string;
		this.builtIn = false;
	}

	readonly uuid: string;
	readonly fid: string;
	readonly title: string;
	readonly description: string;
	readonly builtIn: boolean;
}
