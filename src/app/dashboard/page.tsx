import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import DashboardLive from "@/components/DashboardLive";

export const metadata: Metadata = {
  title: "Dashboard — Ratify",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <>
      <Navigation />
      <main className="pt-36 pb-28">
        <div className="mx-auto max-w-[1000px] px-8">
          <h1 className="text-4xl tracking-tight mb-2 font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Reviews
          </h1>
          <p className="text-secondary mb-10">
            Live pull request reviews from every repository Ratify is installed on.
          </p>
          <DashboardLive />
        </div>
      </main>
      <Footer />
    </>
  );
}
