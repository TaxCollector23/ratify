import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SignInForm from "@/components/SignInForm";

export const metadata: Metadata = {
  title: "Sign in — Ratify",
};

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <>
      <Navigation />
      <main className="pt-36 pb-28">
        <div className="mx-auto max-w-[440px] px-6">
          <SignInForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
