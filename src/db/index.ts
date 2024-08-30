import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDbConnection(d1: D1Database) {
  return drizzle(d1, { schema });
}
