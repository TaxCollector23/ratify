"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useAuth } from "@/lib/auth/context";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";

const DOCS_URL = "https://taxcollector23.github.io/ratify/";

const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "Docs", href: DOCS_URL, external: true },
  { label: "Pricing", href: "/pricing" },
  { label: "Benchmarks", href: "/benchmarks" },
];

function AuthCta() {
  const { state, refresh } = useAuth();

  async function handleSignOut() {
    try {
      await signOut(getFirebaseAuth());
    } catch {
      // Even if Firebase sign-out fails locally, clear our server session.
    }
    await fetch("/api/session-logout", { method: "POST" });
    await refresh();
    window.location.href = "/";
  }

  // Loading state — don't flash the wrong CTA before /api/me settles.
  if (state === null) {
    return <span className="w-24 h-8 rounded-lg bg-surface animate-pulse" aria-hidden />;
  }

  if (!state.authed) {
    return (
      <>
        <a
          href="/signin"
          className="text-sm text-secondary hover:text-foreground transition-colors duration-200"
        >
          Sign in
        </a>
        <a
          href="/signin?next=/install"
          className="text-sm font-medium text-white bg-primary hover:bg-primary-hover px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-md hover:shadow-primary/10"
        >
          Get started
        </a>
      </>
    );
  }

  if (state.hasInstallation) {
    return (
      <>
        <button
          onClick={handleSignOut}
          className="text-sm text-secondary hover:text-foreground transition-colors duration-200"
        >
          Sign out
        </button>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-white bg-primary hover:bg-primary-hover px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-md hover:shadow-primary/10"
        >
          Dashboard
        </Link>
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleSignOut}
        className="text-sm text-secondary hover:text-foreground transition-colors duration-200"
      >
        Sign out
      </button>
      <a
        href="/install"
        className="text-sm font-medium text-white bg-primary hover:bg-primary-hover px-4 py-2 rounded-lg transition-all duration-200 hover:shadow-md hover:shadow-primary/10"
      >
        Install
      </a>
    </>
  );
}

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { scrollY } = useScroll();
  const { state } = useAuth();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 50);
  });

  return (
    <>
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          className={`mx-auto transition-all duration-300 ${
            scrolled
              ? "bg-background/90 backdrop-blur-xl border-b border-border"
              : "bg-transparent"
          }`}
        >
          <nav
            className={`mx-auto flex items-center justify-between transition-all duration-300 max-w-[1440px] ${
              scrolled ? "px-8 lg:px-12 py-3" : "px-8 lg:px-12 py-5"
            }`}
          >
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.svg" alt="Ratify" width={28} height={28} className="rounded-md" />
              <span className="text-lg font-semibold tracking-tight">Ratify</span>
            </Link>

            {/* Center Nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                  className="text-sm text-secondary hover:text-foreground transition-colors duration-200"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Right Nav */}
            <div className="hidden md:flex items-center gap-4">
              <AuthCta />
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 -mr-2"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <motion.span
                  className="w-full h-0.5 bg-foreground block"
                  animate={mobileOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.2 }}
                />
                <motion.span
                  className="w-full h-0.5 bg-foreground block"
                  animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
                  transition={{ duration: 0.1 }}
                />
                <motion.span
                  className="w-full h-0.5 bg-foreground block"
                  animate={mobileOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </button>
          </nav>
        </div>
      </motion.header>

      {/* Mobile Menu */}
      <motion.div
        className="fixed inset-0 z-40 bg-background md:hidden pointer-events-none"
        initial={false}
        animate={mobileOpen ? { opacity: 1, pointerEvents: "auto" as const } : { opacity: 0, pointerEvents: "none" as const }}
        transition={{ duration: 0.2 }}
      >
        <div className="pt-24 px-6 flex flex-col gap-6">
          {navLinks.map((link, i) => (
            <motion.a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="text-2xl font-medium text-foreground"
              initial={{ opacity: 0, y: 20 }}
              animate={mobileOpen ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </motion.a>
          ))}
          <div className="h-px bg-border my-2" />
          {state === null ? null : state.authed && state.hasInstallation ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center text-lg font-medium text-white bg-primary px-6 py-3 rounded-lg w-fit"
            >
              Dashboard
            </Link>
          ) : state.authed ? (
            <a
              href="/install"
              className="inline-flex items-center justify-center text-lg font-medium text-white bg-primary px-6 py-3 rounded-lg w-fit"
            >
              Install
            </a>
          ) : (
            <a
              href="/signin"
              className="inline-flex items-center justify-center text-lg font-medium text-white bg-primary px-6 py-3 rounded-lg w-fit"
            >
              Sign in
            </a>
          )}
        </div>
      </motion.div>
    </>
  );
}
