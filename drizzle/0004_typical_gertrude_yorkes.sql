ALTER TABLE `workouts` ADD `programWorkoutId` int;--> statement-breakpoint
CREATE INDEX `workouts_program_idx` ON `workouts` (`userId`,`programWorkoutId`,`performedAt`);