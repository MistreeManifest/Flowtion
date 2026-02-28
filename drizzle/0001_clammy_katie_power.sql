CREATE TABLE `artifact_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`threadId` int,
	`v` int NOT NULL DEFAULT 1,
	`kind` enum('svg','html','image','markdown') NOT NULL DEFAULT 'html',
	`uri` text NOT NULL,
	`summary` text,
	`embeddingSourceText` text,
	`compositeVersion` varchar(16) NOT NULL DEFAULT 'v1',
	`tags` json,
	`embedding` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `artifact_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `breath_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`threadId` int,
	`inhaleDurationMs` int,
	`castStalled` boolean NOT NULL DEFAULT false,
	`exhaleType` enum('full','truncated','skipped') NOT NULL DEFAULT 'full',
	`cycleDepth` int NOT NULL DEFAULT 1,
	`messageId` int,
	`artifactVersionId` int,
	`cycleDurationMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `breath_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`text` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL DEFAULT 'Untitled',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`preview` varchar(512) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `threads_id` PRIMARY KEY(`id`)
);
