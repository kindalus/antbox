export class Group {
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
