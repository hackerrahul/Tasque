import { Hono } from 'hono';
import { Env } from './types';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { queueConfigs, queueMessages } from './db/schema';

export { Scheduler } from './durable-objects/scheduler';

const app = new Hono<{ Bindings: Env }>();

const scheduleSchema = z.object({
  config: z.object({
    destination: z.string().url(),
    delay: z.number().optional(),
    max_retries: z.number().optional(),
    repeat: z.object({
      interval: z.number().optional(),
      cron: z.string().optional(),
    }).refine(data => data.interval !== undefined || data.cron !== undefined, {
      message: "Either 'interval' or 'cron' must be provided",
    }).optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('POST'),
    headers: z.record(z.string()).optional(),
  }),
  payload: z.record(z.any()),
});

const queueConfigSchema = z.object({
  name: z.string(),
  parallelism: z.number().int().positive().optional(),
  type: z.enum(['fifo', 'standard']).optional(),
});

const queueSchema = scheduleSchema.extend({
  queueName: z.string(),
});

app.post('/v1/publish', zValidator('json', scheduleSchema), async (c) => {
  try {
    const scheduleRequest = c.req.valid('json');
    const id = c.env.DO_SCHEDULER.newUniqueId();
    const stub = c.env.DO_SCHEDULER.get(id);
    await stub.fetch(new Request('http://0/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scheduleRequest),
    }));
    return c.json({ success: true, id: id.toString() });
  } catch (error:any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});


app.post('/v1/schedules', zValidator('json', scheduleSchema), async (c) => {
  try {
    const scheduleRequest = c.req.valid('json');
    const id = c.env.DO_SCHEDULER.newUniqueId();
    const stub = c.env.DO_SCHEDULER.get(id);
    await stub.fetch(new Request('http://0/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scheduleRequest),
    }));
    return c.json({ success: true, id: id.toString() });
  } catch (error:any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

app.get('/v1/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const stub = c.env.DO_SCHEDULER.get(c.env.DO_SCHEDULER.idFromString(id));
    const response = await stub.fetch(new Request('http://0/status'));
    const result = await response.json();
    return c.json({ success: true, data: result });
  } catch (error:any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

app.delete('/v1/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const stub = c.env.DO_SCHEDULER.get(c.env.DO_SCHEDULER.idFromString(id));
    await stub.fetch(new Request('http://0/delete', { method: 'DELETE' }));
    return c.json({ success: true });
  } catch (error:any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

app.post('/v1/queues', zValidator('json', queueConfigSchema), async (c) => {
  try {
    const queueConfig = c.req.valid('json');
    const queueId = c.env.DO_SCHEDULER.idFromName(queueConfig.name);
    const stub = c.env.DO_SCHEDULER.get(queueId);
    await stub.fetch(new Request('http://0/create-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queueConfig),
    }));
    return c.json({ success: true, queueName: queueConfig.name });
  } catch (error:any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

app.post('/v1/enqueue/:queueName', zValidator('json', queueSchema), async (c) => {
  try {
    const queueRequest = c.req.valid('json');
    const queueName = c.req.param('queueName');
    const queueId = c.env.DO_SCHEDULER.idFromName(queueName);
    const stub = c.env.DO_SCHEDULER.get(queueId);
    const response = await stub.fetch(new Request('http://0/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...queueRequest, queueName }),
    }));
    const result = await response.json();
    return c.json({ success: true, result });
  } catch (error:any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

app.delete('/v1/queues/:queueName', async (c) => {
  try {
    const queueName = c.req.param('queueName');
    const queueId = c.env.DO_SCHEDULER.idFromName(queueName);
    const stub = c.env.DO_SCHEDULER.get(queueId);
    const response = await stub.fetch(new Request('http://0/delete-queue', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: queueName }),
    }));
    const result = await response.json();
    return c.json({ success: true, result });
  } catch (error:any) {
    return c.json({ success: false, error: error.message }, 400);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log("Scheduled event triggered");
  },
};