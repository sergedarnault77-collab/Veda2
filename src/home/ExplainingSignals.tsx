import { STUB_SIGNALS } from "./stubs";
import "./ExplainingSignals.css";

/* TODO: Wire to real AI reasoning engine for live signal explanations. */

export function ExplainingSignals() {
  return (
    <section className="signals" aria-label="Explaining signals">
      <h3 className="signals__title">Explaining Signals</h3>

      {STUB_SIGNALS.map((s, i) => (
        <article key={i} className="signals__card">
          <h4 className="signals__card-title">{s.title}</h4>
          <p className="signals__card-body">{s.body}</p>
        </article>
      ))}

      <p className="signals__disclaimer">
        These observations are interpretive. Individual responses vary
        considerably. Nothing here is intended as medical advice.
      </p>
    </section>
  );
}
