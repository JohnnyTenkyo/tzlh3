CREATE TABLE `ai_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(50) NOT NULL,
	`apiEndpoint` varchar(500) NOT NULL,
	`apiKey` varchar(500) NOT NULL,
	`model` varchar(100) NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_user_provider` UNIQUE(`userId`,`provider`)
);
--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `totalCommissionFee` decimal(15,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `backtest_sessions` ADD `totalPlatformFee` decimal(15,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `backtest_trades` ADD `commissionFee` decimal(15,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `backtest_trades` ADD `platformFee` decimal(15,2) DEFAULT '0';--> statement-breakpoint
CREATE INDEX `idx_user_active` ON `ai_configs` (`userId`,`isActive`);