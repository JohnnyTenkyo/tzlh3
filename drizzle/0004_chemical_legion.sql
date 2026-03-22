CREATE TABLE `custom_data_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`provider` varchar(50) NOT NULL,
	`apiEndpoint` varchar(500),
	`apiKey` varchar(500),
	`description` text,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_data_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `custom_data_sources` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_user_active` ON `custom_data_sources` (`userId`,`isActive`);