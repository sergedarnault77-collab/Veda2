import StackSignal from "./StackSignal";
import SignalExplainer from "./SignalExplainer";
import { DailyReferenceBars } from "./DailyReferenceBars";
import ScanSection from "./ScanSection";
import { StackCoverage } from "./StackCoverage";
import "./HomePage.css";

interface Props {
  isAI?: boolean;
}

export default function HomePage({ isAI = false }: Props) {
  return (
    <main className="home">
      <header className="home__header">
        <h1 className="home__logo">Veda</h1>
      </header>

      {isAI ? (
        <>
          {/* 1. PRIMARY — Overall Stack Signal (hero) */}
          <StackSignal />

          {/* 2. SECONDARY — Why this signal (explainer) */}
          <SignalExplainer />

          {/* 3. SUPPORTING — Today's exposure (sugars, caffeine, etc.) */}
          <DailyReferenceBars />

          {/* 4. TERTIARY — Scan status + scan button */}
          <ScanSection />

          {/* 5. Stack coverage (collapsed unless active) */}
          <StackCoverage />
        </>
      ) : (
        <div className="home__freemium">
          <div className="home__freemiumCard">
            <div className="home__freemiumTitle">AI features are available on the Veda AI plan</div>
            <p className="home__freemiumSub">
              Scanning, analysis, signal interpretation, and stack insights are part of Veda AI.
              Upgrade from your account menu to unlock these features.
            </p>
            <div className="home__freemiumHint">
              You can still manage your supplements and medications from the tabs below.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
