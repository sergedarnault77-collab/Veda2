export type InsightSeverity = "ok" | "info" | "caution" | "attention";

export type InsightLens = {
  now: string[];
  overTime: string[];
};

export type InsightStep = {
  whatWeSee: string[];
  whyItMatters: string[];
  meaning: InsightLens;
  consider: string[];
};

export type HomeInsight = {
  id: string;
  title: string;
  severity: InsightSeverity;
  step: InsightStep;
  delta?: {
    newSignals: number;
    summaryLines: string[];
  };
};

export type HomeSituationModel = {
  mode: "current" | "preview";
  previewLabel?: string;
  insights: HomeInsight[];
};
