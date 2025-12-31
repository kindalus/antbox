/**
 * Priority levels for notifications
 */
export type NotificationPriority = "CRITICAL" | "INFO" | "INSIGHT";

/**
 * NotificationData - Represents a notification stored in the system
 *
 * Notifications must target at least one of targetUser or targetGroup (never none).
 * They can target both a specific user and a group simultaneously.
 */
export interface NotificationData {
	/** Unique identifier for the notification */
	readonly uuid: string;

	/** Target user email (optional if targetGroup is provided) */
	readonly targetUser?: string;

	/** Target group UUID (optional if targetUser is provided) */
	readonly targetGroup?: string;

	/** Priority level: CRITICAL, INFO, or INSIGHT */
	readonly priority: NotificationPriority;

	/** Notification title */
	readonly title: string;

	/** Notification body/message */
	readonly body: string;

	/** Timestamp when the notification was created */
	readonly timestamp: string;
}
