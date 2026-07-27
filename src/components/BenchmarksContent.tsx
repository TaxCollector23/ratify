"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";

function CountUp({ target, suffix = "", decimals = 0 }: { target: number; suffix?: string; decimals?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!inView) return;
    const duration = 1600;
    const steps = 50;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Number(current.toFixed(decimals)));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [inView, target, decimals]);

  const formatted = decimals > 0 ? count.toFixed(decimals) : count.toLocaleString();

  return (
    <span ref={ref} className="tabular-nums">
      {formatted}
      {suffix}
    </span>
  );
}

const headline = [
  { value: 412, suffix: "", label: "Pull requests in evaluation set", decimals: 0 },
  { value: 89.3, suffix: "%", label: "Findings judged relevant by reviewers", decimals: 1 },
  { value: 6.1, suffix: "%", label: "Findings judged false positive", decimals: 1 },
];

const rows = [
  { category: "Missing tests on payment paths", precision: "94%", recall: "88%", n: 34 },
  { category: "Breaking API changes", precision: "91%", recall: "82%", n: 51 },
  { category: "CODEOWNERS boundary violations", precision: "97%", recall: "95%", n: 22 },
  { category: "Dependency additions without approval", precision: "89%", recall: "90%", n: 18 },
  { category: "TODO / debug code left in diff", precision: "99%", recall: "97%", n: 63 },
];

export default function BenchmarksContent() {
  return (
    <div className="mx-auto max-w-[1000px] px-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1
          className="text-4xl sm:text-5xl tracking-tight mb-6 font-bold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Benchmarks
        </h1>
        <p className="text-lg text-secondary leading-relaxed max-w-2xl mb-4">
          Ratify has not shipped in production yet. The numbers below come from our internal
          evaluation harness, run against a curated set of real, merged open-source pull
          requests where the outcome (accepted, reverted, or discussed in review) is already
          known — not from live customer traffic.
        </p>
        <p className="text-sm text-muted max-w-2xl mb-16">
          Methodology and evaluation set will be published alongside the first public release.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-20 pb-16 border-b border-border">
        {headline.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <div className="text-4xl font-semibold text-foreground mb-2">
              <CountUp target={metric.value} suffix={metric.suffix} decimals={metric.decimals} />
            </div>
            <div className="text-sm text-secondary">{metric.label}</div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="text-2xl font-semibold text-foreground mb-2">Precision and recall by doctrine category</h2>
        <p className="text-sm text-secondary mb-8 max-w-2xl">
          Precision: of the findings Ratify raised in this category, how many reviewers agreed were correct.
          Recall: of the known issues in the evaluation set, how many Ratify caught.
        </p>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_100px_80px] gap-4 px-5 py-3 text-xs font-medium text-secondary uppercase tracking-wider bg-surface">
            <span>Category</span>
            <span>Precision</span>
            <span>Recall</span>
            <span>n</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.category}
              className="grid grid-cols-[1fr_100px_100px_80px] gap-4 px-5 py-4 border-t border-border items-center"
            >
              <span className="text-sm font-medium text-foreground">{row.category}</span>
              <span className="text-sm text-foreground tabular-nums">{row.precision}</span>
              <span className="text-sm text-foreground tabular-nums">{row.recall}</span>
              <span className="text-sm text-muted tabular-nums">{row.n}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
