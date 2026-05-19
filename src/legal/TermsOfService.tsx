import "./Legal.css";
import { VedaisBrand } from "../components/VedaisBrand";
import { VEDAIS_LEGAL_EMAIL } from "../lib/site";
import { LegalWebCanonical } from "./LegalWebCanonical";

export default function TermsOfService({ onBack }: { onBack: () => void }) {
  return (
    <main className="legal">
      <button className="legal__back" onClick={onBack}>← Back</button>
      <h1>Terms of Service</h1>
      <p className="legal__updated">Last updated: February 2026</p>

      <section>
        <h2>1. Acceptance</h2>
        <p>
          By using <VedaisBrand /> ("the App"), you agree to these Terms of Service. If you do not
          agree, please do not use the App.
        </p>
      </section>

      <section>
        <h2>2. Service Description</h2>
        <p>
          <VedaisBrand /> is a health-tracking tool that helps you monitor your supplement,
          medication, and dietary intake. The App uses AI to analyse product labels
          and provide informational insights about your daily exposure.
        </p>
      </section>

      <section>
        <h2>3. Not Medical Advice</h2>
        <p>
          <strong><VedaisBrand /> does not provide medical advice, diagnoses, or treatment
          recommendations.</strong> All information provided by the App — including AI-generated
          analysis, interaction warnings, and exposure summaries — is for informational
          purposes only.
        </p>
        <p>
          Always consult a qualified healthcare professional before making decisions
          about supplements, medications, or your health. Do not disregard professional
          medical advice based on information from this App.
        </p>
      </section>

      <section>
        <h2>4. Accuracy</h2>
        <p>
          While we strive for accuracy, <VedaisBrand suffix="'s" /> AI analysis may contain errors. Product
          label scanning depends on image quality and AI interpretation. Nutrient data,
          interaction flags, and exposure estimates are approximate and should not be
          relied upon as the sole source of health information.
        </p>
      </section>

      <section>
        <h2>5. User Responsibilities</h2>
        <ul>
          <li>You must be at least 18 years old to use the App.</li>
          <li>You are responsible for the accuracy of the information you provide.</li>
          <li>You agree not to use the App for any unlawful purpose.</li>
          <li>You are responsible for maintaining the security of your account.</li>
        </ul>
      </section>

      <section>
        <h2>6. Intellectual Property</h2>
        <p>
          The App, its design, code, and content are owned by <VedaisBrand /> and protected by
          applicable intellectual property laws. You may not copy, modify, or
          redistribute any part of the App without written permission.
        </p>
      </section>

      <section>
        <h2>7. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, <VedaisBrand /> and its operators shall not be
          liable for any indirect, incidental, special, or consequential damages arising
          from your use of the App. This includes, but is not limited to, health
          outcomes influenced by information provided through the App.
        </p>
      </section>

      <section>
        <h2>8. Termination</h2>
        <p>
          You may stop using the App at any time and delete your account from the
          account menu. We reserve the right to suspend or terminate access for
          violations of these terms.
        </p>
      </section>

      <section>
        <h2>9. Changes to These Terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the App after
          changes constitutes acceptance of the new terms.
        </p>
      </section>

      <section>
        <h2>10. Governing Law</h2>
        <p>
          These terms are governed by and construed in accordance with applicable law,
          without regard to conflict of law provisions.
        </p>
      </section>

      <section>
        <h2>11. Subscriptions (mobile apps)</h2>
        <p>
          Paid plans purchased through the iOS or Android app are processed by Apple or Google.
          Subscriptions renew automatically for the same term until you cancel. You can manage or
          cancel your subscription in your Apple ID or Google Play account settings. If you cancel,
          you keep access until the end of the current billing period. We do not refund charges
          already processed by the platform; refund requests follow Apple&apos;s or Google&apos;s policies.
        </p>
        <p>
          Free features remain available without a subscription. If a price changes, we will
          communicate it in line with store rules before the change applies to you.
        </p>
      </section>

      <LegalWebCanonical path="terms" />

      <section>
        <h2>12. Contact</h2>
        <p>
          For questions about these terms, contact us at{" "}
          <a href={`mailto:${VEDAIS_LEGAL_EMAIL}`}>{VEDAIS_LEGAL_EMAIL}</a>.
        </p>
      </section>
    </main>
  );
}
