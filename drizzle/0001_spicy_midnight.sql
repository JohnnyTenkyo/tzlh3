CREATE TABLE `backtest_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`strategy` enum('standard','aggressive','ladder_cd_combo','mean_reversion','macd_volume','bollinger_squeeze','gemini_ai') NOT NULL,
	`strategyParams` json,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`symbols` json NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`initialCapital` decimal(15,2) NOT NULL DEFAULT '100000',
	`maxPositionPct` decimal(5,2) NOT NULL DEFAULT '10',
	`totalReturn` decimal(15,4),
	`totalReturnPct` decimal(10,4),
	`winRate` decimal(5,4),
	`maxDrawdown` decimal(10,4),
	`sharpeRatio` decimal(10,4),
	`totalTrades` int,
	`winningTrades` int,
	`losingTrades` int,
	`benchmarkReturn` decimal(10,4),
	`progress` int DEFAULT 0,
	`progressMessage` text,
	`resultSummary` json,
	`aiAnalysis` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `backtest_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `backtest_trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`side` enum('buy','sell') NOT NULL,
	`quantity` decimal(15,4) NOT NULL,
	`price` decimal(15,4) NOT NULL,
	`totalAmount` decimal(15,2) NOT NULL,
	`fee` decimal(10,4) DEFAULT '0',
	`reason` text,
	`signalType` varchar(50),
	`tradeTime` bigint NOT NULL,
	`pnl` decimal(15,2),
	`pnlPct` decimal(10,4),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `backtest_trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cache_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`oldestDate` varchar(30),
	`newestDate` varchar(30),
	`candleCount` int DEFAULT 0,
	`lastUpdated` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`status` enum('empty','partial','complete') DEFAULT 'empty',
	CONSTRAINT `cache_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_cm_symbol_tf` UNIQUE(`symbol`,`timeframe`)
);
--> statement-breakpoint
CREATE TABLE `data_source_health` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(30) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`successCount` int DEFAULT 0,
	`failCount` int DEFAULT 0,
	`lastSuccess` timestamp,
	`lastFail` timestamp,
	`lastError` text,
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `data_source_health_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_dsh_source_tf` UNIQUE(`source`,`timeframe`)
);
--> statement-breakpoint
CREATE TABLE `historical_candle_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`timeframe` varchar(10) NOT NULL,
	`date` varchar(30) NOT NULL,
	`open` decimal(15,4) NOT NULL,
	`high` decimal(15,4) NOT NULL,
	`low` decimal(15,4) NOT NULL,
	`close` decimal(15,4) NOT NULL,
	`volume` bigint DEFAULT 0,
	CONSTRAINT `historical_candle_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_symbol_tf_date` UNIQUE(`symbol`,`timeframe`,`date`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
CREATE INDEX `idx_session` ON `backtest_trades` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_symbol_tf` ON `historical_candle_cache` (`symbol`,`timeframe`);