import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy — Ratify",
};

export default function PrivacyPage() {
  return (
    <>
      <Navigation />
      <main className="pt-36 pb-28">
        <div className="mx-auto max-w-[720px] px-8">
          <h1
            className="text-4xl tracking-tight mb-8 font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Privacy
          </h1>
          <div className="space-y-6 text-secondary leading-relaxed">
            <p>
              Ratify is pre-launch. This page will be replaced with a full privacy policy
              before the product is generally available.
            </p>
            <p>
              In short: Ratify only accesses repository data through the permissions your
              GitHub App installation grants, keeps organization data isolated, and never
              trains shared models on your code. Questions in the meantime can be sent to{" "}
              <a href="mailto:hello@ratify.dev" className="text-primary hover:text-primary-hover">
                hello@ratify.dev
              </a>
              .
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
