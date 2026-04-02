CREATE TABLE `excluded_symbols` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`reason` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `excluded_symbols_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_user_symbol` UNIQUE(`userId`,`symbol`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `excluded_symbols` (`userId`);