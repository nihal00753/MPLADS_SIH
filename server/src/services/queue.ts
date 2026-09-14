import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { dataService } from './dataService';

let redisClient: IORedis | null = null;
let slaQueue: Queue | null = null;
let slaWorker: Worker | null = null;

const REDIS_URL = process.env.REDIS_URL || '';

export function initQueueSystem() {
  console.log('[Queue] Initializing BullMQ SLA & Notification queue...');

  // Attempt to connect to Upstash Redis if configured
  if (REDIS_URL && REDIS_URL.includes('upstash') && !REDIS_URL.includes('YOUR_UPSTASH_TOKEN')) {
    try {
      redisClient = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
        tls: { rejectUnauthorized: false },
      });

      redisClient.on('connect', () => {
        console.log('[Queue] Connected successfully to Upstash Redis!');
      });

      redisClient.on('error', (err) => {
        console.warn(`[Queue] Redis connection warning: ${err.message}. Relying on local SLA timers.`);
      });

      slaQueue = new Queue('sla-monitoring-queue', { connection: redisClient });

      slaWorker = new Worker(
        'sla-monitoring-queue',
        async (job) => {
          if (job.name === 'check-sla-deadlines') {
            runSlaCheck();
          }
        },
        { connection: redisClient }
      );
    } catch (e: any) {
      console.warn(`[Queue] Failed to initialize Redis connection: ${e.message}. Using local cron loop.`);
    }
  } else {
    console.log('[Queue] Upstash Redis URL is pending in .env. Running SLA monitor via resilient in-memory timer.');
  }

  // Resilient in-process timer runs every 60 seconds regardless of Redis status
  setInterval(() => {
    runSlaCheck();
  }, 60000);

  // Run initial check
  setTimeout(() => runSlaCheck(), 5000);
}

function runSlaCheck() {
  const now = new Date().getTime();
  const oneDayMs = 24 * 3600 * 1000;

  dataService.alerts.forEach((alert) => {
    if (alert.status === 'OPEN') {
      const deadline = new Date(alert.slaDeadline).getTime();
      const timeLeft = deadline - now;

      // If less than 24 hours left and no warning sent yet
      if (timeLeft > 0 && timeLeft < oneDayMs) {
        const existingWarning = dataService.notifications.find(
          (n) => n.workId === alert.workId && n.type === 'SLA_WARNING'
        );

        if (!existingWarning) {
          const hours = Math.round(timeLeft / (3600 * 1000));
          dataService.notifications.unshift({
            id: `notif-sla-${Date.now()}-${alert.id}`,
            userId: 'usr-district-01',
            role: 'DISTRICT',
            scopeId: alert.district,
            type: 'SLA_WARNING',
            message: `URGENT SLA WARNING: Alert ${alert.id} (${alert.workTitle.slice(0, 30)}) has only ${hours} hours remaining before automatic escalation!`,
            workId: alert.workId,
            read: false,
            createdAt: new Date().toISOString(),
          });
          console.log(`[SLA Alert] Generated SLA warning notification for ${alert.id} (${hours}h remaining)`);
        }
      }
    }
  });
}
