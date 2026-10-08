CREATE TABLE `apple_auth_challenges` (
	`id` varchar(64) NOT NULL,
	`nonce` varchar(96) NOT NULL,
	`credentialHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `apple_auth_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guest_invite_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(48) NOT NULL,
	`targetUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guest_invite_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `guest_invite_aliases_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `apple_auth_challenges_expires_idx` ON `apple_auth_challenges` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `guest_invite_aliases_target_idx` ON `guest_invite_aliases` (`targetUserId`);