import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SnippetReview from "@/components/SnippetReview";

export const metadata: Metadata = {
  title: "Review a code snippet — Ratify",
  description: "Paste any code snippet and Ratify's full pipeline — deterministic policy checks, AST analysis, and a 3-LLM consensus panel — reviews it instantly.",
};

export const dynamic = "force-dynamic";

export default function ReviewPage() {
  return (
    <>
      <Navigation />
      <main className="pt-36 pb-28">
        <div className="mx-auto max-w-[1100px] px-8">
          <div className="mb-10">
            <h1
              className="text-4xl tracking-tight mb-3 font-bold"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Review a snippet
            </h1>
            <p className="text-lg text-secondary leading-relaxed max-w-2xl">
              Paste any code. Ratify runs its real pipeline — deterministic policy checks,
              AST analysis for TypeScript/JavaScript, and a 3-LLM consensus panel — and
              returns findings in a few seconds. No GitHub install required.
            </p>
          </div>
          <SnippetReview />
        </div>
      </main>
      <Footer />
    </>
  );
}
