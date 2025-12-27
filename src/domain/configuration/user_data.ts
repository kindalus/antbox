/**
 * UserData - Immutable configuration data for users
 * Used in ConfigurationRepository instead of UserNode
 *
 * Note: email serves as the UUID for users
 */
export interface UserData {
	readonly email: string; // Used as UUID
	readonly title: string; // Full name
	readonly group: string; // Primary group UUID
	readonly groups: string[]; // All group memberships
	readonly phone?: string;
	readonly hasWhatsapp: boolean;
	readonly active: boolean; // Can user login?
	readonly createdTime: string;
	readonly modifiedTime: string;
}
