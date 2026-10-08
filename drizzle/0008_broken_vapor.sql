CREATE TABLE `program_workout_skips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`programWorkoutId` int NOT NULL,
	`skippedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `program_workout_skips_id` PRIMARY KEY(`id`),
	CONSTRAINT `program_workout_skips_programWorkoutId_unique` UNIQUE(`programWorkoutId`)
);
--> statement-breakpoint
CREATE INDEX `program_workout_skips_user_idx` ON `program_workout_skips` (`userId`,`skippedAt`);