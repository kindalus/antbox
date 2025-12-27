/**
 * ApiKeyData - Immutable configuration data for API keys
 * Separated from Node-based storage
 *
 * Note: API keys are not updated, only created and deleted
 */
export interface ApiKeyData {
	readonly uuid: string;
	readonly title: string;
	readonly secret: string;
	readonly group: string;
	readonly description?: string;
	readonly active: boolean;
	readonly createdTime: string;
}
