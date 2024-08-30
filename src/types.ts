import { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './db/schema';

export interface Env {
  DB: D1Database;
  DO_SCHEDULER: DurableObjectNamespace;
}

export type DrizzleDB = DrizzleD1Database<typeof schema>;

export interface ScheduleConfig {
  destination: string;
  delay?: number;
  max_retries?: number;
  repeat?: {
    interval?: number;
    cron?: string;
  };
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
}

export interface ScheduleRequest {
  config: ScheduleConfig;
  payload: Record<string, any>;
}

export interface QueueConfig {
  name: string;
  parallelism?: number;
  type?: 'fifo' | 'standard';
}

export interface QueueMessage {
  queueName: string;
  config: ScheduleConfig;
  payload: Record<string, any>;
}