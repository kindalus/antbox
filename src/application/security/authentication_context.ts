export interface Principal {
	readonly email: string;
	readonly groups: string[];
}

export interface AuthenticationContext {
	readonly tenant: string;
	readonly principal: Principal;
	readonly mode: "Direct" | "Action" | "AI";
}
