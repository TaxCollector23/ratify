import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ReviewDetail from "@/components/ReviewDetail";

export const metadata: Metadata = {
  title: "Review — Ratify",
};

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Navigation />
      <main className="pt-36 pb-28">
        <div className="mx-auto max-w-[1100px] px-8">
          <ReviewDetail sessionId={id} />
        </div>
      </main>
      <Footer />
    </>
  );
}
