CREATE TABLE `exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(120) NOT NULL,
	`equipment` varchar(48) NOT NULL,
	`category` varchar(48) NOT NULL DEFAULT 'strength',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`exerciseId` int NOT NULL,
	`sortOrder` int NOT NULL,
	`plannedPercent` double,
	CONSTRAINT `template_exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `template_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateExerciseId` int NOT NULL,
	`sortOrder` int NOT NULL,
	`targetReps` int NOT NULL,
	CONSTRAINT `template_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`unit` enum('lb','kg') NOT NULL DEFAULT 'lb',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workoutId` int NOT NULL,
	`exerciseId` int NOT NULL,
	`sortOrder` int NOT NULL,
	`plannedPercent` double,
	CONSTRAINT `workout_exercises_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workoutExerciseId` int NOT NULL,
	`sortOrder` int NOT NULL,
	`targetReps` int NOT NULL,
	`actualReps` int,
	`actualWeight` double,
	`rpe` double,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workout_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workout_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL DEFAULT 'Workout',
	`notes` text,
	`performedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(160) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
CREATE INDEX `exercises_user_idx` ON `exercises` (`userId`);--> statement-breakpoint
CREATE INDEX `template_exercises_template_idx` ON `template_exercises` (`templateId`);--> statement-breakpoint
CREATE INDEX `template_sets_exercise_idx` ON `template_sets` (`templateExerciseId`);--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workoutId`);--> statement-breakpoint
CREATE INDEX `workout_sets_exercise_idx` ON `workout_sets` (`workoutExerciseId`);--> statement-breakpoint
CREATE INDEX `workout_templates_user_idx` ON `workout_templates` (`userId`);--> statement-breakpoint
CREATE INDEX `workouts_user_date_idx` ON `workouts` (`userId`,`performedAt`);