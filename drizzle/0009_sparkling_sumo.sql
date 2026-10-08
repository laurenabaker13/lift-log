ALTER TABLE `challenge_notes` MODIFY COLUMN `preset` enum('nice_lift','your_turn','catching_up','taking_lead','coming_for_you') NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` MODIFY COLUMN `shareFriendActivity` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `workouts` ADD `isPrivate` int DEFAULT 0 NOT NULL;