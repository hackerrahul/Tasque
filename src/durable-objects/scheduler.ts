import { Env, ScheduleRequest, QueueConfig, QueueMessage } from '../types';
import { createDbConnection } from '../db';
import { schedules, queueConfigs, queueMessages } from '../db/schema';
import { eq } from 'drizzle-orm/expressions';
import parser from 'cron-parser';

const MIN_INTERVAL = 1000; // 1 seconds

export class Scheduler {
  private state: DurableObjectState;
  private env: Env;
  private db: any;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.db = createDbConnection(env.DB);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST') {
      if (path === '/schedule') {
        return this.handleSchedule(request);
      } else if (path === '/create-queue') {
        return this.createQueue(request);
      } else if (path === '/enqueue') {
        return this.enqueue(request);
      }
    } else if (request.method === 'GET') {
      if (path === '/status') {
        return this.getStatus();
      }
    } else if (request.method === 'DELETE') {
      if (path === '/delete') {
        return this.deleteSchedule();
      } else if (path === '/delete-queue') {
        return this.deleteQueue(request);
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleSchedule(request: Request): Promise<Response> {
    const scheduleRequest: ScheduleRequest = await request.json();
    const id = this.state.id.toString();
    const now = Date.now();
    const scheduleAt = now + (scheduleRequest.config.delay || 0);

    if (scheduleRequest.config.repeat?.interval && scheduleRequest.config.repeat?.interval < MIN_INTERVAL) {
      return new Response(JSON.stringify({ error: `Interval must be at least ${MIN_INTERVAL} milliseconds` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await this.db.insert(schedules).values({
      id,
      destination: scheduleRequest.config.destination,
      payload: JSON.stringify(scheduleRequest.payload),
      delay: scheduleRequest.config.delay,
      maxRetries: scheduleRequest.config.max_retries || 0,
      scheduleAt,
      repeatInterval: scheduleRequest.config.repeat?.interval,
      repeatCron: scheduleRequest.config.repeat?.cron,
      status: 'scheduled',
    });

    await this.state.storage.put('schedule', scheduleRequest);
    await this.state.storage.setAlarm(scheduleAt);

    return new Response(JSON.stringify({ scheduleId: id }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async getStatus(): Promise<Response> {
    const schedule = await this.db.select().from(schedules).where(eq(schedules.id, this.state.id.toString())).get();
    return new Response(JSON.stringify(schedule), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async deleteSchedule(): Promise<Response> {
    const id = this.state.id.toString();
    
    // Delete from database
    const result = await this.db
      .delete(schedules)
      .where(eq(schedules.id, id));

    // Clear Durable Object storage
    await this.state.storage.deleteAll();

    // Cancel any pending alarms
    await this.state.storage.deleteAlarm();

    if (result.changes && result.changes > 0) {
      return new Response(JSON.stringify({ message: 'Schedule deleted successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ message: 'Schedule not found or already deleted' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async createQueue(request: Request): Promise<Response> {
    const queueConfig: QueueConfig = await request.json();
    const { name, parallelism = 1, type = 'standard' } = queueConfig;

    await this.db.insert(queueConfigs).values({
      name,
      parallelism,
      type,
      createdAt: Date.now(),
    });

    return new Response(JSON.stringify({ message: 'Queue created successfully' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async enqueue(request: Request): Promise<Response> {
    const queueMessage: QueueMessage = await request.json();
    const { queueName, config, payload } = queueMessage;

    const queueConfig = await this.db.select().from(queueConfigs).where(eq(queueConfigs.name, queueName)).get();
    if (!queueConfig) {
      return new Response(JSON.stringify({ error: 'Queue not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = this.env.DO_SCHEDULER.newUniqueId().toString();
    const now = Date.now();
    const scheduleAt = now + (config.delay || 0);

    let sequenceNumber = null;
    if (queueConfig.type === 'fifo') {
      const lastMessage = await this.db
        .select({ sequenceNumber: queueMessages.sequenceNumber })
        .from(queueMessages)
        .where(eq(queueMessages.queueName, queueName))
        .orderBy(queueMessages.sequenceNumber, 'desc')
        .limit(1)
        .get();

      sequenceNumber = (lastMessage?.sequenceNumber || 0) + 1;
    }

    await this.db.insert(queueMessages).values({
      id,
      queueName,
      destination: config.destination,
      payload: JSON.stringify(payload),
      delay: config.delay,
      maxRetries: config.max_retries || 0,
      method: config.method || 'POST',
      headers: JSON.stringify(config.headers || {}),
      status: 'pending',
      createdAt: now,
      sequenceNumber,
      scheduleAt, // Add this field to store when the message should be processed
    });

    // Schedule the message processing
    await this.scheduleQueueProcessing(id, scheduleAt);

    return new Response(JSON.stringify({ messageId: id }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async scheduleQueueProcessing(messageId: string, scheduleAt: number) {
    await this.state.storage.put(`queue_message:${messageId}`, { messageId, scheduleAt });
    await this.state.storage.setAlarm(scheduleAt);
  }

  private async processQueueMessages() {
    const queues = await this.db.select().from(queueConfigs).execute();
    
    for (const queue of queues) {
      const messages = await this.db
        .select()
        .from(queueMessages)
        .where(eq(queueMessages.queueName, queue.name))
        .where(eq(queueMessages.status, 'pending'))
        .orderBy(queueMessages.scheduleAt, 'asc')
        .limit(queue.parallelism)
        .execute();

      const processingPromises = messages.map((message: { id: string; }) => this.processQueueMessage(message.id));
      await Promise.all(processingPromises);
    }
  }

  async alarm() {
    const schedule = await this.state.storage.get('schedule') as ScheduleRequest;
    if (schedule) {
      try {
        const response = await fetch(schedule.config.destination, {
          method: 'POST',
          body: JSON.stringify(schedule.payload),
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        await this.db
          .update(schedules)
          .set({ status: 'completed' })
          .where(eq(schedules.id, this.state.id.toString()));

        if (schedule.config.repeat) {
          let nextSchedule: number;
          if (schedule.config.repeat.interval) {
            nextSchedule = Date.now() + schedule.config.repeat.interval;
          } else if (schedule.config.repeat.cron) {
            const interval = parser.parseExpression(schedule.config.repeat.cron);
            nextSchedule = interval.next().getTime();
          } else {
            throw new Error('Invalid repeat configuration');
          }
          await this.state.storage.setAlarm(nextSchedule);
        } else {
          // Clean up if it's not a recurring schedule
          await this.state.storage.deleteAll();
          await this.db
            .delete(schedules)
            .where(eq(schedules.id, this.state.id.toString()));
        }
      } catch (error) {
        console.error('Error executing schedule:', error);
        const currentSchedule = await this.db.select().from(schedules).where(eq(schedules.id, this.state.id.toString())).get();
        if (currentSchedule && currentSchedule.retries < currentSchedule.maxRetries) {
          await this.db
            .update(schedules)
            .set({ 
              status: 'pending',
              retries: currentSchedule.retries + 1,
              scheduleAt: Date.now() + MIN_INTERVAL // Retry after minimum interval
            })
            .where(eq(schedules.id, this.state.id.toString()));
          await this.state.storage.setAlarm(Date.now() + MIN_INTERVAL);
        } else {
          await this.db
            .update(schedules)
            .set({ status: 'failed' })
            .where(eq(schedules.id, this.state.id.toString()));
          // Clean up failed schedule
          await this.state.storage.deleteAll();
        }
      }
    }

    // Process queue messages
    await this.processQueueMessages();

    // Schedule the next alarm for the earliest pending message
    const nextMessage = await this.db
      .select()
      .from(queueMessages)
      .where(eq(queueMessages.status, 'pending'))
      .orderBy(queueMessages.scheduleAt, 'asc')
      .limit(1)
      .get();

    if (nextMessage) {
      await this.state.storage.setAlarm(nextMessage.scheduleAt);
    }
  }

  private async processQueueMessage(messageId: string) {
    const message = await this.db
      .select()
      .from(queueMessages)
      .where(eq(queueMessages.id, messageId))
      .get();

    if (!message || message.status !== 'pending') {
      return;
    }

    try {
      const response = await fetch(message.destination, {
        method: message.method || 'POST',
        body: message.payload,
        headers: JSON.parse(message.headers || '{}'),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await this.db
        .update(queueMessages)
        .set({ status: 'completed' })
        .where(eq(queueMessages.id, message.id));
    } catch (error) {
      console.error('Error processing queue message:', error);
      if (message.retries! < message.maxRetries!) {
        await this.db
          .update(queueMessages)
          .set({ 
            status: 'pending',
            retries: (message.retries ?? 0) + 1,
            scheduleAt: Date.now() + MIN_INTERVAL, // Reschedule after minimum interval
          })
          .where(eq(queueMessages.id, message.id));
        await this.scheduleQueueProcessing(message.id, Date.now() + MIN_INTERVAL);
      } else {
        await this.db
          .update(queueMessages)
          .set({ status: 'failed' })
          .where(eq(queueMessages.id, message.id));
      }
    }
  }

  private async deleteQueue(request: Request): Promise<Response> {
    const { name } = await request.json() as { name: string };

    // Delete queue config
    const deleteConfigResult = await this.db
      .delete(queueConfigs)
      .where(eq(queueConfigs.name, name));

    // Delete all messages for this queue
    const deleteMessagesResult = await this.db
      .delete(queueMessages)
      .where(eq(queueMessages.queueName, name));

    if (deleteConfigResult.changes > 0) {
      return new Response(JSON.stringify({ message: 'Queue deleted successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Queue not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}