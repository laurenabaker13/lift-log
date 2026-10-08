CREATE TABLE `plan_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`storageKey` varchar(360) NOT NULL,
	`status` enum('uploaded','analyzed','failed') NOT NULL DEFAULT 'uploaded',
	`extractedJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plan_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `program_exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programWorkoutId` int NOT NULL,
	`exerciseId` int NOT NULL,
	`sortOrder` int NOT NULL,
	`prescriptionMode` enum('percent','weight') NOT NULL DEFAULT 'percent',
	`intensityPercent` double,
	`plannedWeightKg` double,
	`targetRpe` double,
	CONSTRAINT `program_exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `program_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programExerciseId` int NOT NULL,
	`sortOrder` int NOT NULL,
	`targetReps` int NOT NULL,
	CONSTRAINT `program_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `program_weeks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programId` int NOT NULL,
	`weekNumber` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `program_weeks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `program_workouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programWeekId` int NOT NULL,
	`dayOfWeek` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`sortOrder` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `program_workouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_programs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`notes` text,
	`sourceStorageKey` varchar(360),
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `training_programs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `plannedWeightKg` double;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `targetRpe` double;--> statement-breakpoint
CREATE INDEX `plan_imports_user_idx` ON `plan_imports` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `program_exercises_workout_idx` ON `program_exercises` (`programWorkoutId`);--> statement-breakpoint
CREATE INDEX `program_sets_exercise_idx` ON `program_sets` (`programExerciseId`);--> statement-breakpoint
CREATE INDEX `program_weeks_program_idx` ON `program_weeks` (`programId`,`weekNumber`);--> statement-breakpoint
CREATE INDEX `program_workouts_week_idx` ON `program_workouts` (`programWeekId`,`dayOfWeek`);--> statement-breakpoint
CREATE INDEX `training_programs_user_idx` ON `training_programs` (`userId`,`isActive`);