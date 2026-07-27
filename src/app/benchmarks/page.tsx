import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import BenchmarksContent from "@/components/BenchmarksContent";

export const metadata: Metadata = {
  title: "Benchmarks — Ratify",
  description: "How Ratify performs against real pull request review data: methodology, evaluation datasets, and results.",
};

export default function BenchmarksPage() {
  return (
    <>
      <Navigation />
      <main className="pt-32 pb-24">
        <BenchmarksContent />
      </main>
      <Footer />
    </>
  );
}
