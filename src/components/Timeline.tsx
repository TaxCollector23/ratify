"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const stages = [
  {
    label: "Pull Request Opened",
    detail: "Ratify indexes the repository and the proposed changes the moment a pull request is opened.",
  },
  {
    label: "Doctrine Evaluated",
    detail: "The diff is evaluated against the engineering principles that already govern this repository.",
  },
  {
    label: "Evidence Generated",
    detail: "Every finding ships with supporting evidence from your repository's own history, not a bare verdict.",
  },
  {
    label: "Findings Addressed",
    detail: "The developer responds and Ratify re-evaluates, before the pull request reaches a human reviewer.",
  },
  {
    label: "Merge",
    detail: "Human review focuses on design and tradeoffs. The repeatable baseline is already enforced.",
  },
];

export default function Timeline() {
  const [activeStage, setActiveStage] = useState<number | null>(null);

  return (
    <section className="py-24 overflow-hidden">
      <div className="mx-auto max-w-[1440px] px-8 lg:px-12">
        <motion.div
          className="mb-16 max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <h2
            className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            From commit to merge
          </h2>
          <p className="text-lg text-secondary">
            Hover each stage to inspect what Ratify is doing internally.
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute top-[24px] left-0 right-0 h-px bg-border hidden md:block" />

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-0">
            {stages.map((stage, i) => (
              <motion.div
                key={stage.label}
                className="relative flex flex-col items-center text-center group cursor-pointer"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                onMouseEnter={() => setActiveStage(i)}
                onMouseLeave={() => setActiveStage(null)}
              >
                <motion.div
                  className={`relative z-10 w-12 h-12 rounded-full border flex items-center justify-center mb-4 text-sm font-semibold transition-colors duration-300 ${
                    activeStage === i
                      ? "bg-primary border-primary text-white"
                      : "bg-white border-border text-secondary group-hover:border-primary/40 group-hover:text-primary"
                  }`}
                >
                  {i + 1}
                </motion.div>

                <span
                  className={`text-sm font-medium mb-3 transition-colors duration-200 ${
                    activeStage === i ? "text-foreground" : "text-secondary"
                  }`}
                >
                  {stage.label}
                </span>

                <AnimatePresence>
                  {activeStage === i && (
                    <motion.div
                      className="hidden md:block text-xs text-secondary leading-relaxed max-w-[170px]"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.2 }}
                    >
                      {stage.detail}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
