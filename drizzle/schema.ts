import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  bigint,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users (from scaffold) ───────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).default("Untitled").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Threads ─────────────────────────────────────────────────────────────────

export const threads = mysqlTable("threads", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  preview: varchar("preview", { length: 512 }).default("").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Thread = typeof threads.$inferSelect;
export type InsertThread = typeof threads.$inferInsert;

// ─── Messages ────────────────────────────────────────────────────────────────

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── Artifact Versions ───────────────────────────────────────────────────────

export const artifactVersions = mysqlTable("artifact_versions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  threadId: int("threadId"),
  v: int("v").notNull().default(1),
  kind: mysqlEnum("kind", ["svg", "html", "image", "markdown"]).notNull().default("html"),
  uri: text("uri").notNull(),
  summary: text("summary"),
  /** The composite text used to generate the embedding vector */
  embeddingSourceText: text("embeddingSourceText"),
  /** Version of the composite generation logic that produced embeddingSourceText */
  compositeVersion: varchar("compositeVersion", { length: 16 }).default("v1").notNull(),
  /** JSON array of tags extracted during the delta phase */
  tags: json("tags").$type<string[]>(),
  /** Embedding vector stored as JSON array of floats (for future pgvector migration) */
  embedding: json("embedding").$type<number[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ArtifactVersion = typeof artifactVersions.$inferSelect;
export type InsertArtifactVersion = typeof artifactVersions.$inferInsert;

// ─── Breath Events ───────────────────────────────────────────────────────────

export const breathEvents = mysqlTable("breath_events", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  threadId: int("threadId"),
  /** Duration of the inhale phase in milliseconds */
  inhaleDurationMs: int("inhaleDurationMs"),
  /** Whether the cast phase stalled beyond the expected threshold */
  castStalled: boolean("castStalled").default(false).notNull(),
  /** The nature of the exhale: full reflection, truncated, or skipped */
  exhaleType: mysqlEnum("exhaleType", ["full", "truncated", "skipped"]).default("full").notNull(),
  /** A computed metric representing the depth/complexity of this breathing cycle */
  cycleDepth: int("cycleDepth").default(1).notNull(),
  /** The message that initiated this breath */
  messageId: int("messageId"),
  /** The artifact version produced by this breath, if any */
  artifactVersionId: int("artifactVersionId"),
  /** Total cycle duration in milliseconds */
  cycleDurationMs: int("cycleDurationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BreathEvent = typeof breathEvents.$inferSelect;
export type InsertBreathEvent = typeof breathEvents.$inferInsert;
