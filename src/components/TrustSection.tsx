"use client";

import { motion } from "framer-motion";

export default function TrustSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <motion.div
          className="rounded-2xl border border-border px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1.5">
              How Ratify performs against real review data
            </h3>
            <p className="text-sm text-secondary max-w-xl">
              Methodology, evaluation datasets, and results — not marketing numbers.
            </p>
          </div>
          <a
            href="/benchmarks"
            className="inline-flex items-center justify-center text-sm font-medium text-foreground bg-white border border-border px-5 py-2.5 rounded-lg transition-colors duration-200 hover:border-foreground/20 whitespace-nowrap"
          >
            View benchmarks
          </a>
        </motion.div>
      </div>
    </section>
  );
}
