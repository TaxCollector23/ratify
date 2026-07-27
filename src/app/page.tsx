import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import TrustSection from "@/components/TrustSection";
import FeatureGrid from "@/components/FeatureGrid";
import Timeline from "@/components/Timeline";
import ProductPreview from "@/components/ProductPreview";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <TrustSection />
        <FeatureGrid />
        <Timeline />
        <ProductPreview />
      </main>
      <Footer />
    </>
  );
}
