import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import DashboardTabs from "@/components/DashboardTabs";

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
            Dashboard
          </h1>
          <p className="text-secondary mb-10">
            Everything Ratify sees across the repositories you own.
          </p>
          <DashboardTabs />
        </div>
      </main>
      <Footer />
    </>
  );
}
