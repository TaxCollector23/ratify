import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import PricingContent from "@/components/PricingContent";

export const metadata: Metadata = {
  title: "Pricing — Ratify",
  description: "Ratify pricing: Free, Plus, and Enterprise plans.",
};

export default function PricingPage() {
  return (
    <>
      <Navigation />
      <main className="pt-32 pb-24">
        <PricingContent />
      </main>
      <Footer />
    </>
  );
}
