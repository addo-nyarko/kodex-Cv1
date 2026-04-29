import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bucket name in Supabase Storage. Must exactly match the bucket created in the dashboard. */
export const BUCKET = "evidence";

/**
 * Build the storage object key for an evidence file.
 * Path scheme: orgs/<orgId>/evidence/<evidenceId>/<fileName>
 * Mirrors the existing S3 key format so existing rows stay valid.
 */
export function buildEvidenceKey(
  orgId: string,
  evidenceId: string,
  fileName: string
): string {
  const safe = fileName.replace(/^\/+/, "").replace(/[^\w.\-_ ]/g, "_");
  return `orgs/${orgId}/evidence/${evidenceId}/${safe}`;
}

/**
 * Create a signed URL the client can PUT a file directly to.
 * Returns the URL, the token (needed in the Authorization header), and the path.
 *
 * Browser upload pattern:
 *   await fetch(uploadUrl, {
 *     method: "PUT",
 *     headers: { Authorization: `Bearer ${token}`, "x-upsert": "false" },
 *     body: file,
 *   });
 */
export async function getSignedUploadUrl(
  key: string
): Promise<{ uploadUrl: string; token: string; path: string }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(key);

  if (error) throw new Error(`Signed upload URL failed: ${error.message}`);
  if (!data) throw new Error("Signed upload URL: no data returned");

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  };
}

/**
 * Generate a temporary signed download URL (15 minutes).
 * Used when the UI needs to render or download a stored evidence file.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 900
): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresInSeconds);

  if (error) throw new Error(`Signed download URL failed: ${error.message}`);
  if (!data?.signedUrl) throw new Error("Signed download URL: no URL returned");

  return data.signedUrl;
}

/**
 * Download an object's bytes server-side.
 * Used by pdf-extract.ts to read file content for text extraction.
 * Uses the admin client (service role) because this runs without a user session.
 */
export async function downloadObject(key: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(key);

  if (error) throw new Error(`Download failed: ${error.message}`);
  if (!data) throw new Error("Download: no data returned");

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Delete an object from storage.
 * Returns true if deleted, false if not found.
 */
export async function deleteObject(key: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove([key]);

  if (error) {
    if (error.message.includes("not found")) return false;
    throw new Error(`Delete failed: ${error.message}`);
  }
  return true;
}
