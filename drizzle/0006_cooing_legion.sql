ALTER TABLE `workouts` ADD `activeProgramWorkoutId` int;--> statement-breakpoint
ALTER TABLE `workouts` ADD CONSTRAINT `workouts_activeProgramWorkoutId_unique` UNIQUE(`activeProgramWorkoutId`);