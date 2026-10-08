ALTER TABLE `friend_activities` ADD `publishKey` varchar(96);--> statement-breakpoint
ALTER TABLE `friend_activities` ADD CONSTRAINT `friend_activities_publish_unique` UNIQUE(`publishKey`);