ALTER TABLE `user_settings` ADD `unitChosen` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workouts` ADD `durationSeconds` int;
--> statement-breakpoint
UPDATE `user_settings` SET `unitChosen` = 1;
