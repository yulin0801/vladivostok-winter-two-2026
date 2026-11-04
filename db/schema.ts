import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const records = sqliteTable("trip_records", {
  id: text("id").primaryKey(), type: text("type").notNull(), payload: text("payload").notNull(),
  version: integer("version").notNull().default(1), updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(), deleted: integer("deleted").notNull().default(0),
});
export const apiCache = sqliteTable("api_cache", {
  key: text("key").primaryKey(), payload: text("payload").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const serviceLimits = sqliteTable("service_limits", {
  name: text("name").primaryKey(), nextAllowed: integer("next_allowed").notNull(),
});
