import "./Legal.css";

export default function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return (
    <main className="legal">
      <button className="legal__back" onClick={onBack}>← Back</button>
      <h1>Privacy Policy</h1>
      <p className="legal__updated">Last updated: February 2026</p>

      <section>
        <h2>1. What We Collect</h2>
        <p>
          Veda collects the minimum information needed to provide its services:
        </p>
        <ul>
          <li><strong>Account data</strong> — name, email address, country, and city you provide during registration.</li>
          <li><strong>Profile data</strong> — biological sex, age range, height, and weight (optional, used to personalise insights).</li>
          <li><strong>Usage data</strong> — supplements, medications, and scanned product labels you add to the app.</li>
          <li><strong>Device data</strong> — photos taken for label scanning are processed in-session and are not stored on our servers.</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Your Data</h2>
        <ul>
          <li>To provide personalised health exposure insights and interaction warnings.</li>
          <li>To sync your data across devices when you log in with the same email.</li>
          <li>To improve our AI analysis models (aggregated, non-identifiable data only).</li>
        </ul>
        <p>We do <strong>not</strong> sell your personal data to third parties.</p>
      </section>

      <section>
        <h2>3. AI-Powered Features</h2>
        <p>
          Veda uses AI (OpenAI) to analyse scanned product labels and provide contextual
          answers. When you scan a product or ask a question:
        </p>
        <ul>
          <li>The product image and text are sent to OpenAI for analysis.</li>
          <li>Your supplement and medication list may be included for interaction checking.</li>
          <li>OpenAI processes data per their data usage policy and does not use API inputs for training.</li>
        </ul>
      </section>

      <section>
        <h2>4. Data Storage & Security</h2>
        <p>
          Your data is stored locally on your device and optionally synced to our secure
          database (hosted on Neon/PostgreSQL via Vercel). Data in transit is encrypted
          via HTTPS. We do not store scanned images after processing.
        </p>
      </section>

      <section>
        <h2>5. Your Rights</h2>
        <ul>
          <li><strong>Access</strong> — all your data is visible within the app at all times.</li>
          <li><strong>Deletion</strong> — you can delete your account and all associated data from the account menu.</li>
          <li><strong>Portability</strong> — your data is stored in standard formats accessible via the app.</li>
          <li><strong>Correction</strong> — you can update your profile information at any time.</li>
        </ul>
      </section>

      <section>
        <h2>6. Children</h2>
        <p>
          Veda is not intended for use by anyone under 18 years of age. We do not
          knowingly collect data from minors.
        </p>
      </section>

      <section>
        <h2>7. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be
          communicated through the app. Continued use after changes constitutes acceptance.
        </p>
      </section>

      <section>
        <h2>8. Contact</h2>
        <p>
          For questions about this privacy policy or your data, contact us at{" "}
          <a href="mailto:privacy@veda.health">privacy@veda.health</a>.
        </p>
      </section>
    </main>
  );
}
