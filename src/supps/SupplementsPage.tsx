import "./SupplementsPage.css";

/* TODO: Add supplement CRUD, overlap/interaction flags (✅/⚠️), and explain pop-up. */

export default function SupplementsPage() {
  return (
    <div className="supps-page">
      <h1 className="supps-page__heading">Your supplements</h1>
      <p className="supps-page__intro">
        Maintain your supplements here. We'll show overlap and interaction flags
        within this stack.
      </p>

      <div className="supps-page__empty">
        <div className="supps-page__empty-label">No supplements yet.</div>
        <div className="supps-page__empty-hint">
          {/* TODO: add supplement + show ✅/⚠️ indicators and an explain pop-up. */}
          Next step: add supplement + show ✅/⚠️ indicators and an explain
          pop-up.
        </div>
      </div>
    </div>
  );
}
