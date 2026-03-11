/**
 * UserPreferencesData - Private preferences for the authenticated user.
 *
 * Email is used as the storage key but is never provided by the client API.
 */
export interface UserPreferencesData {
	readonly email: string;
	readonly preferences: Record<string, unknown>;
}
