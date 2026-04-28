"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const supabase = createClient();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-xl p-8 border border-zinc-800">
        <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
        <p className="text-zinc-400 mb-6 text-sm">Sign in to your Kodex account</p>
        {/* Suspense boundary required because useSearchParams reads from dynamic data */}
        <Suspense fallback={<div className="h-48 animate-pulse bg-zinc-800 rounded-lg" />}>
          <SignInForm />
        </Suspense>
        <div className="mt-6 space-y-2 text-sm text-zinc-400">
          <p>
            New to Kodex?{" "}
            <Link href="/sign-up" className="text-blue-400 hover:underline">Create an account</Link>
          </p>
          <p>
            <Link href="/forgot-password" className="text-blue-400 hover:underline">Forgot password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
