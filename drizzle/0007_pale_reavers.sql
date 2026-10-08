CREATE TABLE `activity_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`authorId` int NOT NULL,
	`message` varchar(180) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('fist_bump','fire','strong') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_reactions_user_unique` UNIQUE(`activityId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `challenge_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengeId` int NOT NULL,
	`authorId` int NOT NULL,
	`preset` enum('nice_lift','your_turn','catching_up') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `challenge_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `friend_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`workoutId` int NOT NULL,
	`kind` enum('workout_completed','personal_record') NOT NULL,
	`workoutName` varchar(120),
	`exerciseId` int,
	`exerciseName` varchar(120),
	`equipment` varchar(48),
	`valueKg` double,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `friend_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `friend_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterId` int NOT NULL,
	`recipientId` int NOT NULL,
	`status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `friend_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `friend_connections_direction_unique` UNIQUE(`requesterId`,`recipientId`)
);
--> statement-breakpoint
CREATE TABLE `lift_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`opponentId` int NOT NULL,
	`exerciseName` varchar(120) NOT NULL,
	`equipment` varchar(48) NOT NULL,
	`status` enum('pending','active','declined','canceled','expired') NOT NULL DEFAULT 'pending',
	`endsAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lift_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `socialDisplayName` varchar(48);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `socialNameMode` enum('account','display') DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `shareFriendActivity` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `activity_comments_activity_idx` ON `activity_comments` (`activityId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `activity_comments_author_idx` ON `activity_comments` (`authorId`);--> statement-breakpoint
CREATE INDEX `activity_reactions_activity_idx` ON `activity_reactions` (`activityId`);--> statement-breakpoint
CREATE INDEX `challenge_notes_challenge_idx` ON `challenge_notes` (`challengeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `friend_activities_actor_idx` ON `friend_activities` (`actorId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `friend_activities_workout_idx` ON `friend_activities` (`workoutId`);--> statement-breakpoint
CREATE INDEX `friend_connections_requester_idx` ON `friend_connections` (`requesterId`,`status`);--> statement-breakpoint
CREATE INDEX `friend_connections_recipient_idx` ON `friend_connections` (`recipientId`,`status`);--> statement-breakpoint
CREATE INDEX `lift_challenges_creator_idx` ON `lift_challenges` (`creatorId`,`status`);--> statement-breakpoint
CREATE INDEX `lift_challenges_opponent_idx` ON `lift_challenges` (`opponentId`,`status`);