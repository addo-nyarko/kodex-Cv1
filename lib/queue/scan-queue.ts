/**
 * Scan Queue — manages chunked scan execution via Upstash Redis + QStash
 *
 * Instead of running the entire scan in one long-lived function,
 * we break it into chunks of 2-3 controls. Each chunk:
 * 1. Reads state from Redis
 * 2. Processes a few controls
 * 3. Saves state back to Redis
 * 4. Queues the next chunk via QStash
 *
 * This lets scans run on Vercel's 10s function limit (free tier).
 */

import { redis } from "./redis";
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

/** How many controls to process per chunk */
export const CONTROLS_PER_CHUNK = 2;

/** Redis key helpers */
const scanStateKey = (scanId: string) => `scan:${scanId}:state`;
const scanEventsKey = (scanId: string) => `scan:${scanId}:events`;

/** Evidence metadata type */
export interface EvidenceSource {
  type: 'github' | 'document' | 'questionnaire' | 'clarification';
  scannedAt: string;
  reliability: 'high' | 'medium' | 'low';
  label: string;
}

/** Scan state stored between chunks */
export interface ScanChunkState {
  scanId: string;
  frameworkType: string;
  orgId: string;
  /** Index of next control to process */
  controlIndex: number;
  /** Total controls in this framework */
  totalControls: number;
  /** Whether evidence has been prepared */
  evidencePrepared: boolean;
  /** Serialized evidence pool (stored separately if too large) */
  evidenceKey?: string;
  /** Whether LLM evaluation should be used */
  useLLM: boolean;
  /** Whether clarification was asked in this chunk */
  clarificationAsked: boolean;
  /** Phase: 'evidence' | 'controls' | 'post' */
  phase: "evidence" | "controls" | "post";
  /** For multi-framework: array of {scanId, frameworkType} still to process */
  pendingFrameworks?: Array<{ scanId: string; frameworkType: string }>;
  /** Project context for post-scan */
  projectId?: string;
  /** Evidence sources with metadata */
  sources: EvidenceSource[];
}

/** Save scan state to Redis (TTL 24 hours to allow long clarification waits) */
export async function saveScanState(state: ScanChunkState): Promise<void> {
  await redis.set(scanStateKey(state.scanId), JSON.stringify(state), { ex: 86400 });
}

/** Load scan state from Redis */
export async function loadScanState(scanId: string): Promise<ScanChunkState | null> {
  const raw = await redis.get<string>(scanStateKey(scanId));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw as unknown as ScanChunkState;
}

/** Delete scan state (cleanup after completion) */
export async function clearScanState(scanId: string): Promise<void> {
  await redis.del(scanStateKey(scanId));
  // Keep events for a while so frontend can read them
  await redis.expire(scanEventsKey(scanId), 3600);
}

/** Append a narration event for the frontend to poll */
export async function pushScanEvent(
  scanId: string,
  message: string
): Promise<void> {
  await redis.rpush(scanEventsKey(scanId), message);
  await redis.expire(scanEventsKey(scanId), 3600);
}

/** Get all narration events for a scan */
export async function getScanEvents(scanId: string): Promise<string[]> {
  const events = await redis.lrange(scanEventsKey(scanId), 0, -1);
  return events as string[];
}

/** Store evidence pool in Redis (can be large, so separate key) */
export async function saveEvidence(scanId: string, evidence: unknown): Promise<string> {
  const key = `scan:${scanId}:evidence`;
  await redis.set(key, JSON.stringify(evidence), { ex: 3600 });
  return key;
}

/** Load evidence pool from Redis */
export async function loadEvidence(key: string): Promise<unknown> {
  const raw = await redis.get<string>(key);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

/**
 * Queue the next scan chunk via QStash.
 * QStash will POST to our worker endpoint after a short delay.
 */
export async function queueNextChunk(scanId: string, delay?: number): Promise<void> {
  const workerUrl = `${getBaseUrl()}/api/scan/worker`;

  await qstash.publishJSON({
    url: workerUrl,
    body: { scanId },
    retries: 2,
    ...(delay ? { delay } : {}),
  });
}

/** Get the base URL for QStash callbacks */
function getBaseUrl(): string {
  // Stable custom domain wins — same value across every deploy.
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Fall back to Vercel's per-deployment URL only if no custom domain set.
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  throw new Error(
    "Cannot determine base URL for QStash callback. Set NEXT_PUBLIC_APP_URL in Vercel environment variables."
  );
}
