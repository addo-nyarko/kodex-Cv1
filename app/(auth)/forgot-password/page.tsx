"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-xl p-8 border border-zinc-800">
        <h1 className="text-2xl font-bold mb-2">Reset password</h1>
        {sent ? (
          <p className="text-zinc-300 mt-4">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <>
            <p className="text-zinc-400 mb-6 text-sm">We&apos;ll email you a link to reset your password.</p>
            <form onSubmit={handleReset} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition"
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-sm text-zinc-400">
          <Link href="/sign-in" className="text-blue-400 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
