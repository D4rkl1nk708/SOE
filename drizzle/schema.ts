import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, date } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
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

/**
 * Disciplines table - stores study subjects with color and priority
 */
export const disciplines = mysqlTable("disciplines", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"), // hex color
  weight: int("weight").notNull().default(1), // priority 1-10
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Discipline = typeof disciplines.$inferSelect;
export type InsertDiscipline = typeof disciplines.$inferInsert;

/**
 * Topics table - stores studied topics linked to disciplines
 */
export const topics = mysqlTable("topics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  disciplineId: int("disciplineId").notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  studyDate: varchar("studyDate", { length: 10 }).notNull(), // YYYY-MM-DD format
  notes: text("notes"), // optional notes about the topic
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;

/**
 * Revisions table - stores scheduled revisions and random tests
 * Type: 'revision' for fixed 25/50 day revisions, 'test' for random tests
 */
export const revisions = mysqlTable("revisions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  topicId: int("topicId").notNull(),
  scheduledDate: varchar("scheduledDate", { length: 10 }).notNull(), // YYYY-MM-DD format
  type: mysqlEnum("type", ["revision", "test"]).notNull().default("revision"),
  revisionNumber: int("revisionNumber").notNull().default(1), // 1-5 for 25-day, 6+ for 50-day
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Revision = typeof revisions.$inferSelect;
export type InsertRevision = typeof revisions.$inferInsert;
