/**
 * GroupData - Immutable configuration data for user groups
 * Used in ConfigurationRepository instead of GroupNode
 *
 * Note: Groups are not updated, only created and deleted
 */
export interface GroupData {
	readonly uuid: string;
	readonly title: string;
	readonly description?: string;
	readonly createdTime: string;
}
