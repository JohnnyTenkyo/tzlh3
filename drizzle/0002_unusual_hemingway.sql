CREATE TABLE `scheduled_warming_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`sectors` json,
	`marketCapTiers` json,
	`customSymbols` json,
	`cronExpression` varchar(100) NOT NULL,
	`isEnabled` boolean DEFAULT true,
	`lastExecutedAt` timestamp,
	`nextExecutedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_warming_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `warming_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` varchar(64) NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'pending',
	`dataSource` varchar(30),
	`errorMessage` text,
	`duration` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `warming_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `warming_progress_taskId_unique` UNIQUE(`taskId`)
);
--> statement-breakpoint
CREATE TABLE `warming_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`dataSource` varchar(30) NOT NULL,
	`successCount` int DEFAULT 0,
	`failCount` int DEFAULT 0,
	`totalDuration` bigint DEFAULT 0,
	`averageDuration` decimal(10,2) DEFAULT '0',
	`lastUpdated` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warming_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_user_source` UNIQUE(`userId`,`dataSource`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `scheduled_warming_tasks` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_enabled` ON `scheduled_warming_tasks` (`isEnabled`);--> statement-breakpoint
CREATE INDEX `idx_next_executed` ON `scheduled_warming_tasks` (`nextExecutedAt`);--> statement-breakpoint
CREATE INDEX `idx_task_id` ON `warming_progress` (`taskId`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `warming_progress` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_status` ON `warming_progress` (`status`);