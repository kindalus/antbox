import { AuthService } from "../../auth_service";
import { Auth, getAuth } from "firebase/auth";

export default class CmzAuthService implements AuthService {
	private auth: Auth;

	constructor() {
		this.auth = getAuth();
	}

	getUserId(): string {
		return this.auth.currentUser?.email ?? "GUEST";
	}
}
