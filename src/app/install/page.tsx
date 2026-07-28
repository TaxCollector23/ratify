import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import InstallGate from "@/components/InstallGate";

export const metadata: Metadata = {
  title: "Install Ratify — Ratify",
};

export const dynamic = "force-dynamic";

export default function InstallPage() {
  const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  const installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : null;

  return (
    <>
      <Navigation />
      <main className="pt-36 pb-28">
        <div className="mx-auto max-w-[640px] px-8">
          <InstallGate installUrl={installUrl} />
        </div>
      </main>
      <Footer />
    </>
  );
}
