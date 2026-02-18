export type Sex = "male" | "female" | "unspecified";
export type AgeBucket = "18_50" | "51_65" | "65_plus";

export type UserContext = {
  sex: Sex;
  ageBucket: AgeBucket;
};

export type NutrientId = string;

export type IntakeLine = {
  nutrientId: NutrientId;
  amount: number;
  unit: "mg" | "ug";
  source: "supplement" | "food" | "med" | "drink";
};

export type DietAnswers = Record<string, string>;

export type FoodCoverage =
  | "likely_covered_by_food"
  | "maybe_covered"
  | "unknown"
  | "hard_to_cover_from_food";

export type NutrientComputed = {
  nutrientId: NutrientId;
  label: string;
  unit: "mg" | "ug";
  kind?: "vitamin" | "mineral";
  target?: number;
  refType?: "RDA" | "AI" | "LIMIT";
  ul?: number | null;
  ulAppliesTo?: "total" | "supplements_only" | "synthetic_only" | "no_ul" | "limit";
  supplementTotal: number;
  percentOfTargetFromSupps?: number;
  ulPercentFromSupps?: number;
  flags: {
    approachingUl?: boolean;
    exceedsUl?: boolean;
    redundantStacking?: boolean;
  };
  foodCoverage: FoodCoverage;
};
