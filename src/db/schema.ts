import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  destination: text('destination').notNull(),
  payload: text('payload').notNull(),
  delay: integer('delay'),
  maxRetries: integer('max_retries').default(0),
  retries: integer('retries').default(0),
  scheduleAt: integer('schedule_at'),
  repeatInterval: integer('repeat_interval'),
  repeatCron: text('repeat_cron'),
  status: text('status').default('pending'),
  createdAt: integer('created_at').default(sql`(unixepoch())`),
});

export const queueConfigs = sqliteTable('queue_configs', {
  name: text('name').primaryKey(),
  parallelism: integer('parallelism').default(1),
  type: text('type').default('standard'), // 'fifo' or 'standard'
  createdAt: integer('created_at'),
});

export const queueMessages = sqliteTable('queue_messages', {
  id: text('id').primaryKey(),
  queueName: text('queue_name').notNull(),
  destination: text('destination').notNull(),
  payload: text('payload').notNull(),
  delay: integer('delay').default(0),
  maxRetries: integer('max_retries').default(0),
  scheduleAt: integer('schedule_at'),
  retries: integer('retries').default(0),
  method: text('method').default('POST'),
  headers: text('headers').default('{}'),
  status: text('status').default('pending'),
  createdAt: integer('created_at'),
  sequenceNumber: integer('sequence_number'), // For FIFO queues
});