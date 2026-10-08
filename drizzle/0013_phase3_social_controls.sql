CREATE TABLE `friend_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` int NOT NULL,
	`blockedId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friend_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `friend_blocks_direction_unique` UNIQUE(`blockerId`,`blockedId`)
);
--> statement-breakpoint
CREATE TABLE `friend_mutes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mutedUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friend_mutes_id` PRIMARY KEY(`id`),
	CONSTRAINT `friend_mutes_direction_unique` UNIQUE(`userId`,`mutedUserId`)
);
--> statement-breakpoint
CREATE TABLE `friend_nudge_locks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`lastSentAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `friend_nudge_locks_id` PRIMARY KEY(`id`),
	CONSTRAINT `friend_nudge_locks_pair_unique` UNIQUE(`senderId`,`recipientId`)
);
--> statement-breakpoint
CREATE TABLE `friend_nudges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`preset` enum('where_are_you','gym_misses_you') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friend_nudges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_notices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipientId` int NOT NULL,
	`actorId` int NOT NULL,
	`kind` enum('friend_request','nudge','challenge','challenge_accepted','challenge_note','challenge_win') NOT NULL,
	`message` varchar(180) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `social_notices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `friend_activities` MODIFY COLUMN `kind` enum('workout_completed','personal_record','challenge_win') NOT NULL;--> statement-breakpoint
ALTER TABLE `lift_challenges` MODIFY COLUMN `status` enum('pending','active','declined','canceled','expired','won') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `friend_activities` ADD `challengeId` int;--> statement-breakpoint
ALTER TABLE `friend_activities` ADD `opponentId` int;--> statement-breakpoint
ALTER TABLE `lift_challenges` ADD `targetKg` double;--> statement-breakpoint
ALTER TABLE `lift_challenges` ADD `winnerId` int;--> statement-breakpoint
ALTER TABLE `lift_challenges` ADD `winningWorkoutId` int;--> statement-breakpoint
ALTER TABLE `lift_challenges` ADD `winningAt` timestamp;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `allowFriendNudges` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `socialNotificationsEnabled` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `inviteCode` varchar(48);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_inviteCode_unique` UNIQUE(`inviteCode`);--> statement-breakpoint
CREATE INDEX `friend_blocks_blocked_idx` ON `friend_blocks` (`blockedId`);--> statement-breakpoint
CREATE INDEX `friend_mutes_muted_idx` ON `friend_mutes` (`mutedUserId`);--> statement-breakpoint
CREATE INDEX `friend_nudges_pair_idx` ON `friend_nudges` (`senderId`,`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `friend_nudges_recipient_idx` ON `friend_nudges` (`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `social_notices_recipient_idx` ON `social_notices` (`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `social_notices_actor_idx` ON `social_notices` (`actorId`);--> statement-breakpoint
CREATE INDEX `friend_activities_challenge_idx` ON `friend_activities` (`challengeId`);