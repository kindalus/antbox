import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ValidationError } from "shared/validation_error.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type {
	NotificationData,
	NotificationPriority,
} from "domain/configuration/notification_data.ts";
import { NotificationDataSchema } from "domain/configuration/notification_schema.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";

/**
 * Payload for creating a notification
 */
export interface CreateNotificationPayload {
	readonly targetUser?: string;
	readonly targetGroup?: string;
	readonly title: string;
	readonly body: string;
}

/**
 * NotificationsService - Manages notifications in the configuration repository
 *
 * Notifications can be sent with three priority levels:
 * - CRITICAL: Urgent notifications requiring immediate attention
 * - INFO: Informational notifications
 * - INSIGHT: Helpful insights or suggestions
 *
 * Notifications must target at least one of: user or group (never none).
 * Users can delete notifications targeting them directly or groups they belong to.
 */
export class NotificationsService {
	constructor(private readonly configRepo: ConfigurationRepository) {}

	/**
	 * Send a CRITICAL priority notification
	 */
	async critical(
		ctx: AuthenticationContext,
		payload: CreateNotificationPayload,
	): Promise<Either<AntboxError, NotificationData>> {
		return this.#createNotification(ctx, payload, "CRITICAL");
	}

	/**
	 * Send an INFO priority notification
	 */
	async info(
		ctx: AuthenticationContext,
		payload: CreateNotificationPayload,
	): Promise<Either<AntboxError, NotificationData>> {
		return this.#createNotification(ctx, payload, "INFO");
	}

	/**
	 * Send an INSIGHT priority notification
	 */
	async insight(
		ctx: AuthenticationContext,
		payload: CreateNotificationPayload,
	): Promise<Either<AntboxError, NotificationData>> {
		return this.#createNotification(ctx, payload, "INSIGHT");
	}

	/**
	 * List all notifications accessible by the current user
	 * Returns notifications targeting the user directly or any groups they belong to
	 */
	async list(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, NotificationData[]>> {
		const notificationsOrErr = await this.configRepo.list("notifications");
		if (notificationsOrErr.isLeft()) {
			return notificationsOrErr;
		}

		const userEmail = ctx.principal.email;
		const userGroups = ctx.principal.groups;

		// Filter notifications accessible by this user
		const accessibleNotifications = notificationsOrErr.value.filter((n) =>
			n.targetUser === userEmail ||
			(n.targetGroup && userGroups.includes(n.targetGroup))
		);

		// Sort by timestamp descending (most recent first)
		accessibleNotifications.sort((a, b) =>
			new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
		);

		return right(accessibleNotifications);
	}

	/**
	 * Delete notifications by UUIDs
	 * User can delete notifications targeting them directly or groups they belong to
	 */
	async delete(
		ctx: AuthenticationContext,
		uuids: string[],
	): Promise<Either<AntboxError, void>> {
		if (!uuids || uuids.length === 0) {
			return left(new BadRequestError("At least one notification UUID is required"));
		}

		const userEmail = ctx.principal.email;
		const userGroups = ctx.principal.groups;

		for (const uuid of uuids) {
			const notificationOrErr = await this.configRepo.get("notifications", uuid);
			if (notificationOrErr.isLeft()) {
				// Skip non-existent notifications
				continue;
			}

			const notification = notificationOrErr.value;

			// Check authorization: user can delete if notification targets them or their groups
			const canDelete = notification.targetUser === userEmail ||
				(notification.targetGroup && userGroups.includes(notification.targetGroup));

			if (!canDelete) {
				return left(
					new ForbiddenError(`You are not authorized to delete notification ${uuid}`),
				);
			}

			const deleteResult = await this.configRepo.delete("notifications", uuid);
			if (deleteResult.isLeft()) {
				return deleteResult;
			}
		}

		return right(undefined);
	}

	/**
	 * Clear all notifications targeting the current user directly
	 * Note: Group-targeted notifications are not cleared by this method
	 */
	async clearAll(
		ctx: AuthenticationContext,
	): Promise<Either<AntboxError, void>> {
		const notificationsOrErr = await this.configRepo.list("notifications");
		if (notificationsOrErr.isLeft()) {
			return left(notificationsOrErr.value);
		}

		const userEmail = ctx.principal.email;

		// Find all notifications directly targeting this user
		const userNotifications = notificationsOrErr.value.filter(
			(n) => n.targetUser === userEmail,
		);

		// Delete each notification
		for (const notification of userNotifications) {
			const deleteResult = await this.configRepo.delete("notifications", notification.uuid);
			if (deleteResult.isLeft()) {
				return deleteResult;
			}
		}

		return right(undefined);
	}

	#createNotification(
		_ctx: AuthenticationContext,
		payload: CreateNotificationPayload,
		priority: NotificationPriority,
	): Promise<Either<AntboxError, NotificationData>> {
		// Validate that at least one target is provided
		if (!payload.targetUser && !payload.targetGroup) {
			return Promise.resolve(
				left(
					new BadRequestError(
						"Notification must have at least one target: targetUser or targetGroup",
					),
				),
			);
		}

		const notification: NotificationData = {
			uuid: UuidGenerator.generate(),
			targetUser: payload.targetUser,
			targetGroup: payload.targetGroup,
			priority,
			title: payload.title,
			body: payload.body,
			timestamp: new Date().toISOString(),
		};

		// Validate with Zod schema
		const validation = NotificationDataSchema.safeParse(notification);
		if (!validation.success) {
			const errors = validation.error.issues.map((e) =>
				new BadRequestError(`${e.path.join(".")}: ${e.message}`)
			);
			return Promise.resolve(left(ValidationError.from(...errors)));
		}

		return this.configRepo.save("notifications", notification);
	}
}
