"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/context";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  type AuthError,
} from "firebase/auth";

type Mode = "signin" | "signup";

// Firebase surfaces coded errors like `auth/email-already-in-use`. Map them
// to sentences a person can act on.
function friendlyFirebaseError(err: unknown): string {
  const code = (err as AuthError | undefined)?.code;
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/invalid-email":
      return "That email address doesn't look valid.";
    case "auth/weak-password":
      return "That password is too weak. Use at least 6 characters.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error reaching Firebase. Check your connection and try again.";
    default:
      return code ? `Auth failed (${code}).` : "Something went wrong. Please try again.";
  }
}

export default function SignInForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [githubLogin, setGithubLogin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && !githubLogin.trim()) {
      setError("Please enter your GitHub username so we can link your installations.");
      return;
    }

    const auth = getFirebaseAuth();
    let idToken: string;
    try {
      const cred =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
      idToken = await cred.user.getIdToken();
    } catch (err) {
      setError(friendlyFirebaseError(err));
      return;
    }

    const res = await fetch("/api/session-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        githubLogin: mode === "signup" ? githubLogin.trim() : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create session. Please try again.");
      return;
    }

    startTransition(async () => {
      await refresh();
      const next = searchParams.get("next") ?? "/install";
      router.push(next);
    });
  }

  return (
    <div>
      <h1 className="text-3xl tracking-tight mb-2 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
        {mode === "signin" ? "Sign in to Ratify" : "Create your Ratify account"}
      </h1>
      <p className="text-sm text-secondary mb-8">
        {mode === "signin" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="text-primary hover:text-primary-hover"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
            >
              Sign up
            </button>
            .
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="text-primary hover:text-primary-hover"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
            >
              Sign in
            </button>
            .
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
          <input
            type="password"
            required
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        {mode === "signup" && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">GitHub username</label>
            <input
              type="text"
              required
              placeholder="e.g. TaxCollector23"
              value={githubLogin}
              onChange={(e) => setGithubLogin(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted mt-1.5">
              We use this to link the GitHub App installation to your Ratify account.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/[0.04] px-3 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full inline-flex items-center justify-center text-sm font-medium text-white bg-primary hover:bg-primary-hover px-5 py-3 rounded-xl transition-colors duration-200 disabled:opacity-60"
        >
          {pending ? "Signing you in…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
