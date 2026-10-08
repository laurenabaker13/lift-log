ALTER TABLE `user_settings` ADD `firstWeekDays` int;--> statement-breakpoint
ALTER TABLE `workouts` ADD `clientKey` varchar(64);--> statement-breakpoint
ALTER TABLE `workouts` ADD CONSTRAINT `workouts_client_key_unique` UNIQUE(`clientKey`);