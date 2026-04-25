import { Queue } from "bullmq";
import { bullMQConnection } from "./redis";

export const scanQueue = new Queue("scans", {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const evidenceQueue = new Queue("evidence", {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

export const notificationQueue = new Queue("notifications", {
  connection: bullMQConnection,
});

export const reportQueue = new Queue("reports", {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 10000 },
  },
});
