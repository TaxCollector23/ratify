"use client";

import { useState } from "react";
import DashboardLive from "./DashboardLive";
import DoctrineViewer from "./DoctrineViewer";
import AnalyticsPanel from "./AnalyticsPanel";

type Tab = "reviews" | "doctrine" | "analytics";

const tabs: { id: Tab; label: string; description: string }[] = [
  { id: "reviews", label: "Reviews", description: "Live pull request reviews." },
  { id: "doctrine", label: "Doctrine", description: "Rules mined from this repo's history." },
  { id: "analytics", label: "Analytics", description: "Findings, risk, and volume." },
];

export default function DashboardTabs() {
  const [active, setActive] = useState<Tab>("reviews");
  const activeTab = tabs.find((t) => t.id === active)!;

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`relative px-4 py-3 text-sm font-medium transition-colors duration-150 ${
              active === tab.id ? "text-foreground" : "text-secondary hover:text-foreground"
            }`}
          >
            {tab.label}
            {active === tab.id && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>
      <p className="text-sm text-secondary mb-6">{activeTab.description}</p>
      {active === "reviews" && <DashboardLive />}
      {active === "doctrine" && <DoctrineViewer />}
      {active === "analytics" && <AnalyticsPanel />}
    </div>
  );
}
