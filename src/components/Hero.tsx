"use client";

import { motion } from "framer-motion";
import DashboardPreview from "./DashboardPreview";

export default function Hero() {
  return (
    <section className="relative flex items-center pt-32 pb-20">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12 w-full">
        <div className="grid lg:grid-cols-[minmax(0,460px)_1fr] gap-10 lg:gap-16 items-center">
          {/* Left: Text */}
          <div>
            <motion.h1
              className="text-5xl sm:text-6xl leading-[1.02] tracking-tight mb-6 font-bold"
              style={{ fontFamily: "var(--font-heading)" }}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              Engineering standards.
              <br />
              <span className="text-primary">Made executable.</span>
            </motion.h1>

            <motion.p
              className="text-lg text-secondary leading-relaxed mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              Ratify continuously reviews every pull request against your
              team&apos;s engineering doctrine before it reaches production.
            </motion.p>

            <motion.div
              className="flex flex-wrap items-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.a
                href="/pricing"
                className="inline-flex items-center justify-center text-sm font-medium text-white bg-primary px-6 py-3 rounded-xl transition-all duration-200"
                whileHover={{ scale: 1.03, boxShadow: "0 4px 20px -4px rgba(37, 99, 235, 0.4)" }}
                whileTap={{ scale: 0.98 }}
              >
                Get Started
              </motion.a>
              <motion.a
                href="#product"
                className="inline-flex items-center justify-center text-sm font-medium text-secondary bg-white border border-border px-6 py-3 rounded-xl transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                View Demo
              </motion.a>
            </motion.div>
          </div>

          {/* Right: Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <DashboardPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
