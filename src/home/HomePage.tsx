import { ScanSection } from "./ScanSection";
import { ExposureBars } from "./ExposureBars";
import { StackCoverage } from "./StackCoverage";
import { ExplainingSignals } from "./ExplainingSignals";
import "./HomePage.css";

export function HomePage() {
  return (
    <main className="home">
      <header className="home__header">
        <h1 className="home__logo">Veda</h1>
      </header>

      {/* A + B: Scan (dominant) with Exposure bars beside it on wider viewports */}
      <div className="home__top-row">
        <ScanSection />
        <ExposureBars />
      </div>

      {/* C: Stack coverage */}
      <StackCoverage />

      {/* D: Explaining signals */}
      <ExplainingSignals />
    </main>
  );
}
