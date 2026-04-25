import { scanWorker } from "./scan-processor";

console.log("Kodex workers started");
console.log("  → scan worker:", scanWorker.name);

process.on("SIGTERM", async () => {
  await scanWorker.close();
  process.exit(0);
});
