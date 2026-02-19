import { useState, useMemo } from "react";
import "./DrinkBuilder.css";

type DrinkType =
  | "coffee"
  | "espresso"
  | "americano"
  | "cappuccino"
  | "latte"
  | "flat_white"
  | "matcha"
  | "black_tea"
  | "green_tea"
  | "chai"
  | "energy_drink"
  | "milk"
  | "other";

type Size = "S" | "M" | "L";
type Milk = "none" | "dairy" | "oat";
type Sweetener = "none" | "sugar" | "syrup" | "artificial";
type MilkFat = "skim" | "semi" | "whole";

const DRINK_DATA: Record<
  DrinkType,
  { label: string; caffeine: [number, number, number]; calories: [number, number, number] }
> = {
  coffee:       { label: "Coffee",        caffeine: [65, 95, 150],  calories: [2, 2, 3] },
  espresso:     { label: "Espresso",      caffeine: [63, 63, 126],  calories: [1, 1, 2] },
  americano:    { label: "Americano",     caffeine: [63, 95, 150],  calories: [2, 2, 3] },
  cappuccino:   { label: "Cappuccino",    caffeine: [63, 63, 126],  calories: [60, 80, 120] },
  latte:        { label: "Latte",         caffeine: [63, 63, 126],  calories: [90, 120, 180] },
  flat_white:   { label: "Flat White",    caffeine: [63, 130, 130], calories: [70, 100, 100] },
  matcha:       { label: "Matcha",        caffeine: [38, 70, 100],  calories: [5, 10, 15] },
  black_tea:    { label: "Black Tea",     caffeine: [25, 47, 70],   calories: [2, 2, 3] },
  green_tea:    { label: "Green Tea",     caffeine: [20, 28, 40],   calories: [2, 2, 3] },
  chai:         { label: "Chai Latte",    caffeine: [25, 50, 75],   calories: [100, 150, 230] },
  energy_drink: { label: "Energy Drink",  caffeine: [80, 160, 240], calories: [45, 110, 160] },
  milk:         { label: "Milk",          caffeine: [0, 0, 0],      calories: [69, 115, 161] },
  other:        { label: "Other",         caffeine: [0, 40, 80],    calories: [0, 20, 40] },
};

// Per-100ml data scaled to S(150ml) / M(250ml) / L(350ml)
const MILK_FAT_CALORIES: Record<MilkFat, [number, number, number]> = {
  skim:  [51, 85, 119],
  semi:  [69, 115, 161],
  whole: [96, 160, 224],
};

const MILK_FAT_LABELS: Record<MilkFat, string> = {
  skim: "Skim / Non-fat",
  semi: "Semi-skim",
  whole: "Whole",
};

const SIZE_INDEX: Record<Size, number> = { S: 0, M: 1, L: 2 };

const MILK_CALORIES_BASE: Record<Milk, number> = { none: 0, dairy: 40, oat: 30 };
const DAIRY_FAT_CALORIES: Record<MilkFat, number> = { skim: 20, semi: 40, whole: 55 };
const SWEETENER_CALORIES: Record<Sweetener, number> = { none: 0, sugar: 16, syrup: 20, artificial: 0 };

export interface DrinkEstimate {
  drinkLabel: string;
  size: Size;
  milk: Milk;
  sweetener: Sweetener;
  caffeineMg: number;
  caloriesKcal: number;
  isDecaf: boolean;
  sweetenerType: string | null;
}

interface Props {
  onAdd: (estimate: DrinkEstimate) => void;
  onCancel: () => void;
}

export default function DrinkBuilder({ onAdd, onCancel }: Props) {
  const [drink, setDrink] = useState<DrinkType | null>(null);
  const [size, setSize] = useState<Size>("M");
  const [milk, setMilk] = useState<Milk>("none");
  const [milkFat, setMilkFat] = useState<MilkFat>("semi");
  const [sweetener, setSweetener] = useState<Sweetener>("none");
  const [decaf, setDecaf] = useState(false);

  const estimate = useMemo<DrinkEstimate | null>(() => {
    if (!drink) return null;
    const d = DRINK_DATA[drink];
    const idx = SIZE_INDEX[size];
    const baseCaffeine = decaf ? 2 : d.caffeine[idx];
    const sweetCal = SWEETENER_CALORIES[sweetener];

    if (drink === "milk") {
      const cal = MILK_FAT_CALORIES[milkFat][idx];
      return {
        drinkLabel: `Milk (${MILK_FAT_LABELS[milkFat]})`,
        size,
        milk: "dairy",
        sweetener,
        caffeineMg: 0,
        caloriesKcal: cal + sweetCal,
        isDecaf: false,
        sweetenerType: sweetener === "artificial" ? "artificial sweetener" : sweetener === "none" ? null : sweetener,
      };
    }

    const baseCal = d.calories[idx];
    const addsMilk = milk !== "none" && !["cappuccino", "latte", "flat_white", "chai"].includes(drink);
    const milkCal = addsMilk
      ? (milk === "dairy" ? DAIRY_FAT_CALORIES[milkFat] : MILK_CALORIES_BASE[milk])
      : 0;

    return {
      drinkLabel: d.label,
      size,
      milk,
      sweetener,
      caffeineMg: baseCaffeine,
      caloriesKcal: baseCal + milkCal + sweetCal,
      isDecaf: decaf,
      sweetenerType: sweetener === "artificial" ? "artificial sweetener" : sweetener === "none" ? null : sweetener,
    };
  }, [drink, size, milk, milkFat, sweetener, decaf]);

  const hasCaffeineOption = drink !== null && drink !== "other";
  const DAIRY_DRINKS: DrinkType[] = ["cappuccino", "latte", "flat_white", "chai"];
  const drinkHasDairy = drink !== null && DAIRY_DRINKS.includes(drink);

  return (
    <div className="drink-builder">
      <h4 className="drink-builder__title">Log a drink</h4>

      {/* Step 1: Drink type */}
      <div className="drink-builder__grid">
        {(Object.keys(DRINK_DATA) as DrinkType[]).map((key) => (
          <button
            key={key}
            className={`drink-builder__chip ${drink === key ? "drink-builder__chip--active" : ""}`}
            onClick={() => {
              setDrink(key);
              if (["cappuccino", "latte", "flat_white", "chai"].includes(key)) {
                setMilk("dairy");
              } else if (key !== "milk") {
                setMilk("none");
              }
            }}
          >
            {DRINK_DATA[key].label}
          </button>
        ))}
      </div>

      {drink && (
        <>
          {/* Step 2: Size */}
          <div className="drink-builder__section">
            <span className="drink-builder__label">Size</span>
            <div className="drink-builder__toggles">
              {(["S", "M", "L"] as Size[]).map((s) => (
                <button
                  key={s}
                  className={`drink-builder__toggle ${size === s ? "drink-builder__toggle--active" : ""}`}
                  onClick={() => setSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Decaf (not shown for milk) */}
          {hasCaffeineOption && drink !== "milk" && (
            <div className="drink-builder__section">
              <span className="drink-builder__label">Caffeine</span>
              <div className="drink-builder__toggles">
                <button
                  className={`drink-builder__toggle ${!decaf ? "drink-builder__toggle--active" : ""}`}
                  onClick={() => setDecaf(false)}
                >
                  Regular
                </button>
                <button
                  className={`drink-builder__toggle ${decaf ? "drink-builder__toggle--active" : ""}`}
                  onClick={() => setDecaf(true)}
                >
                  Decaf
                </button>
              </div>
            </div>
          )}

          {/* Milk type for dairy drinks / milk add-on for others */}
          {drink !== "milk" && (
            <div className="drink-builder__section">
              <span className="drink-builder__label">{drinkHasDairy ? "Milk type" : "Milk"}</span>
              <div className="drink-builder__toggles">
                {drinkHasDairy ? (
                  <>
                    {(["dairy", "oat"] as Milk[]).map((m) => (
                      <button
                        key={m}
                        className={`drink-builder__toggle ${milk === m ? "drink-builder__toggle--active" : ""}`}
                        onClick={() => setMilk(m)}
                      >
                        {m === "dairy" ? "Dairy" : "Oat"}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {(["none", "dairy", "oat"] as Milk[]).map((m) => (
                      <button
                        key={m}
                        className={`drink-builder__toggle ${milk === m ? "drink-builder__toggle--active" : ""}`}
                        onClick={() => setMilk(m)}
                      >
                        {m === "none" ? "None" : m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Fat level (dairy-based drinks, milk drink, or dairy add-on selected) */}
          {(drink === "milk" || milk === "dairy" || drinkHasDairy) && (
            <div className="drink-builder__section">
              <span className="drink-builder__label">Fat level</span>
              <div className="drink-builder__toggles">
                {(["skim", "semi", "whole"] as MilkFat[]).map((f) => (
                  <button
                    key={f}
                    className={`drink-builder__toggle ${milkFat === f ? "drink-builder__toggle--active" : ""}`}
                    onClick={() => setMilkFat(f)}
                  >
                    {MILK_FAT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Sweetener */}
          <div className="drink-builder__section">
            <span className="drink-builder__label">Sweetener</span>
            <div className="drink-builder__toggles">
              {(["none", "sugar", "syrup", "artificial"] as Sweetener[]).map((sw) => (
                <button
                  key={sw}
                  className={`drink-builder__toggle ${sweetener === sw ? "drink-builder__toggle--active" : ""}`}
                  onClick={() => setSweetener(sw)}
                >
                  {sw === "none" ? "None" : sw === "artificial" ? "Artificial" : sw.charAt(0).toUpperCase() + sw.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Estimate */}
          {estimate && (
            <div className="drink-builder__estimate">
              <span className="drink-builder__estimateBadge">Estimate</span>
              {estimate.caffeineMg > 0 && (
                <>
                  <span className="drink-builder__estimateVal">
                    ~{estimate.caffeineMg} mg caffeine
                  </span>
                  <span className="drink-builder__estimateSep">·</span>
                </>
              )}
              <span className="drink-builder__estimateVal">
                ~{estimate.caloriesKcal} kcal
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="drink-builder__actions">
            <button
              className="drink-builder__addBtn"
              onClick={() => estimate && onAdd(estimate)}
            >
              Add to today's intake
            </button>
            <button className="drink-builder__cancelBtn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {!drink && (
        <button className="drink-builder__cancelBtn drink-builder__cancelBtn--top" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
