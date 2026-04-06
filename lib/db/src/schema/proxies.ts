import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const proxiesTable = pgTable("proxies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  ip: text("ip").notNull(),
  port: integer("port").notNull(),
  status: text("status").notNull().default("unchecked"),
  latency: real("latency"),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProxySchema = createInsertSchema(proxiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertProxy = z.infer<typeof insertProxySchema>;
export type Proxy = typeof proxiesTable.$inferSelect;
