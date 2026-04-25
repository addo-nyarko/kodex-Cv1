import { Worker } from "bullmq";
import { bullMQConnection } from "@/lib/redis";
import { runScan } from "@/lib/scan-engine";
import { db } from "@/lib/db";

export const scanWorker = new Worker(
  "scans",
  async (job) => {
    const { scanId, orgId, frameworkType } = job.data as {
      scanId: string;
      orgId: string;
      frameworkType: string;
    };

    try {
      const gen = runScan(scanId, frameworkType, orgId);
      for await (const _event of gen) {
        // Events are persisted inside the generator; nothing more to do here
      }
    } catch (err) {
      await db.scan.update({
        where: { id: scanId },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
          completedAt: new Date(),
        },
      });
      throw err;
    }
  },
  {
    connection: bullMQConnection,
    concurrency: 3,
  }
);

scanWorker.on("failed", (job, err) => {
  console.error(`Scan job ${job?.id} failed:`, err);
});

scanWorker.on("completed", (job) => {
  console.log(`Scan job ${job.id} completed`);
});
