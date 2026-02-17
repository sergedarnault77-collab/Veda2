import { useState } from "react";
import type { BiologicalSex, AgeRange } from "../lib/auth";
import "./ProfileScreen.css";

const AGE_RANGES: { value: AgeRange; label: string }[] = [
  { value: "18-25", label: "18–25" },
  { value: "26-35", label: "26–35" },
  { value: "36-45", label: "36–45" },
  { value: "46-55", label: "46–55" },
  { value: "56-65", label: "56–65" },
  { value: "65+", label: "65+" },
];

interface Props {
  firstName: string;
  onComplete: (profile: {
    sex: BiologicalSex | null;
    heightCm: number | null;
    weightKg: number | null;
    ageRange: AgeRange | null;
  }) => void;
}

export default function ProfileScreen({ firstName, onComplete }: Props) {
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(null);
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  function validate(): string[] {
    const errs: string[] = [];
    if (!sex) errs.push("Please select your biological sex.");
    const h = Number(heightCm);
    if (!heightCm.trim() || !Number.isFinite(h) || h < 50 || h > 280)
      errs.push("Enter a valid height in cm (50–280).");
    const w = Number(weightKg);
    if (!weightKg.trim() || !Number.isFinite(w) || w < 15 || w > 400)
      errs.push("Enter a valid weight in kg (15–400).");
    return errs;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;

    onComplete({
      sex,
      heightCm: Math.round(Number(heightCm)),
      weightKg: Math.round(Number(weightKg) * 10) / 10,
      ageRange,
    });
  }

  function handleSkip() {
    onComplete({ sex: null, heightCm: null, weightKg: null, ageRange: null });
  }

  return (
    <div className="profile">
      <div className="profile__logo">Veda</div>
      <h1 className="profile__title">Welcome, {firstName}</h1>
      <p className="profile__sub">One more step before we get started.</p>

      <div className="profile__why">
        <div className="profile__whyIcon">ℹ</div>
        <div className="profile__whyText">
          <strong>Why do we need this?</strong>
          <span>
            Daily reference values for vitamins and minerals differ by sex, height, and weight.
            Sharing this helps Veda show you accurate daily dose percentages
            rather than generic averages.
          </span>
        </div>
      </div>

      <form className="profile__form" onSubmit={handleSubmit} noValidate>
        <div className="profile__field">
          <label className="profile__label">Biological sex</label>
          <div className="profile__segmented">
            <button
              type="button"
              className={`profile__seg ${sex === "female" ? "profile__seg--active" : ""}`}
              onClick={() => setSex("female")}
            >
              Female
            </button>
            <button
              type="button"
              className={`profile__seg ${sex === "male" ? "profile__seg--active" : ""}`}
              onClick={() => setSex("male")}
            >
              Male
            </button>
            <button
              type="button"
              className={`profile__seg ${sex === "prefer_not_to_say" ? "profile__seg--active" : ""}`}
              onClick={() => setSex("prefer_not_to_say")}
            >
              Prefer not to say
            </button>
          </div>
          {sex === "prefer_not_to_say" && (
            <div className="profile__hint">
              We'll use general adult reference values. You can update this later.
            </div>
          )}
        </div>

        <div className="profile__field">
          <label className="profile__label">Age range</label>
          <div className="profile__ageGrid">
            {AGE_RANGES.map((a) => (
              <button
                key={a.value}
                type="button"
                className={`profile__agePill ${ageRange === a.value ? "profile__agePill--active" : ""}`}
                onClick={() => setAgeRange(a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="profile__row">
          <div className="profile__field">
            <label className="profile__label">Height</label>
            <div className="profile__inputWrap">
              <input
                className="profile__input"
                type="number"
                inputMode="numeric"
                placeholder="170"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
              <span className="profile__unit">cm</span>
            </div>
          </div>

          <div className="profile__field">
            <label className="profile__label">Weight</label>
            <div className="profile__inputWrap">
              <input
                className="profile__input"
                type="number"
                inputMode="decimal"
                placeholder="70"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
              <span className="profile__unit">kg</span>
            </div>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="profile__errors">
            {errors.map((err, i) => (
              <div key={i} className="profile__error">{err}</div>
            ))}
          </div>
        )}

        <button type="submit" className="profile__cta">
          Continue
        </button>

        <button type="button" className="profile__skip" onClick={handleSkip}>
          Skip for now — use generic reference values
        </button>
      </form>

      <div className="profile__privacy">
        This data stays on your device. It is never sent to any server.
      </div>
    </div>
  );
}
