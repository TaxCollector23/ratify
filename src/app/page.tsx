import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import TrustSection from "@/components/TrustSection";
import ProblemSection from "@/components/ProblemSection";
import FeatureGrid from "@/components/FeatureGrid";
import Timeline from "@/components/Timeline";
import ProductPreview from "@/components/ProductPreview";
import Positioning from "@/components/Positioning";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <TrustSection />
        <ProblemSection />
        <FeatureGrid />
        <ProductPreview />
        <Timeline />
        <Positioning />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
