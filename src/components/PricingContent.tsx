"use client";

import { motion } from "framer-motion";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Deterministic checks for a single repository.",
    features: [
      "1 repository",
      "Deterministic policy checks (tests, breaking changes, CODEOWNERS)",
      "50 pull requests reviewed / month",
      "GitHub check runs and PR comments",
      "Community support",
    ],
    cta: "Get started",
    href: "https://github.com/taxcollector23/ratify",
    highlighted: false,
  },
  {
    name: "Plus",
    price: "$49",
    period: "/ repository / month",
    description: "Full repository intelligence and LLM-backed reasoning.",
    features: [
      "Unlimited repositories",
      "Everything in Free",
      "Repository doctrine inference from history",
      "Evidence-backed findings with precedent",
      "Historical context across merged PRs",
      "Priority email support",
    ],
    cta: "Get started",
    href: "https://github.com/taxcollector23/ratify",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Custom deployment, security review, and pricing.",
    features: [
      "Everything in Plus",
      "Self-hosted or VPC deployment",
      "SSO / SAML",
      "Custom doctrine sources and retention policy",
      "Dedicated support and onboarding",
      "Pricing decided per engagement",
    ],
    cta: "Contact us",
    href: "mailto:hello@ratify.dev",
    highlighted: false,
  },
];

export default function PricingContent() {
  return (
    <div className="mx-auto max-w-[1200px] px-8">
      <motion.div
        className="max-w-2xl mb-16"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1
          className="text-4xl sm:text-5xl tracking-tight mb-4 font-bold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Pricing
        </h1>
        <p className="text-lg text-secondary leading-relaxed">
          Start free on a single repository. Move to Plus when you need repository doctrine
          and evidence-backed findings across your whole org.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            className={`rounded-2xl border p-8 flex flex-col ${
              plan.highlighted ? "border-primary/30 bg-primary/[0.02]" : "border-border bg-white"
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
          >
            <h2 className="text-lg font-semibold text-foreground mb-1">{plan.name}</h2>
            <p className="text-sm text-secondary mb-6">{plan.description}</p>
            <div className="mb-6">
              <span className="text-4xl font-semibold text-foreground">{plan.price}</span>
              {plan.period && <span className="text-sm text-secondary ml-1">{plan.period}</span>}
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm text-secondary">
                  <span className="text-primary mt-0.5 shrink-0">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a
              href={plan.href}
              target={plan.href.startsWith("http") ? "_blank" : undefined}
              rel={plan.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className={`inline-flex items-center justify-center text-sm font-medium px-5 py-3 rounded-xl transition-colors duration-200 ${
                plan.highlighted
                  ? "text-white bg-primary hover:bg-primary-hover"
                  : "text-foreground bg-white border border-border hover:border-foreground/20"
              }`}
            >
              {plan.cta}
            </a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
