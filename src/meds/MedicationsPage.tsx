import "./MedicationsPage.css";

/* TODO: Add medication CRUD, interaction flags (✅/⚠️), and explain pop-up. */

export default function MedicationsPage() {
  return (
    <div className="meds-page">
      <h1 className="meds-page__heading">Your medications</h1>
      <p className="meds-page__intro">
        Maintain your medications here. We'll show interaction flags between
        items you've added.
      </p>

      <div className="meds-page__empty">
        <div className="meds-page__empty-label">No medications yet.</div>
        <div className="meds-page__empty-hint">
          {/* TODO: add medication + show ✅/⚠️ indicators and an explain pop-up. */}
          Next step: add medication + show ✅/⚠️ indicators and an explain
          pop-up.
        </div>
      </div>
    </div>
  );
}
