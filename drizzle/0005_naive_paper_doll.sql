CREATE TABLE `account_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`type` enum('verify_email','reset_password') NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `account_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_tokens_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `coach_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainerId` int NOT NULL,
	`athleteEmail` varchar(320) NOT NULL,
	`invitedUserId` int,
	`tokenHash` varchar(128) NOT NULL,
	`status` enum('pending','accepted','declined','expired','canceled') NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp NOT NULL,
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coach_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `coach_invitations_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `coach_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainerId` int NOT NULL,
	`athleteId` int NOT NULL,
	`title` varchar(120) NOT NULL,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`viewedAt` timestamp,
	CONSTRAINT `coach_suggestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trainer_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`trainerId` int NOT NULL,
	`athleteId` int NOT NULL,
	`acceptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trainer_clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `trainer_clients_unique` UNIQUE(`trainerId`,`athleteId`)
);
--> statement-breakpoint
ALTER TABLE `training_programs` ADD `managedByTrainerId` int;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `onboardingComplete` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `isTrainer` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `activeWorkspace` enum('athlete','coach') DEFAULT 'athlete' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerifiedAt` timestamp;--> statement-breakpoint
CREATE INDEX `account_tokens_user_type_idx` ON `account_tokens` (`userId`,`type`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `coach_invitations_trainer_idx` ON `coach_invitations` (`trainerId`,`status`);--> statement-breakpoint
CREATE INDEX `coach_invitations_email_idx` ON `coach_invitations` (`athleteEmail`,`status`);--> statement-breakpoint
CREATE INDEX `coach_suggestions_athlete_idx` ON `coach_suggestions` (`athleteId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `trainer_clients_trainer_idx` ON `trainer_clients` (`trainerId`);--> statement-breakpoint
CREATE INDEX `trainer_clients_athlete_idx` ON `trainer_clients` (`athleteId`);--> statement-breakpoint
CREATE INDEX `training_programs_trainer_idx` ON `training_programs` (`managedByTrainerId`);