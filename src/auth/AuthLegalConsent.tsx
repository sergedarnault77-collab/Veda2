import "./AuthLegalConsent.css";

interface Props {
  variant: "register" | "login";
  onShowLegal: (view: "privacy" | "terms") => void;
}

export function AuthLegalConsent({ variant, onShowLegal }: Props) {
  const intro =
    variant === "register"
      ? "By creating an account, you agree to our"
      : "By logging in, you agree to our";

  return (
    <p className="auth-legal-consent">
      {intro}{" "}
      <button type="button" className="auth-legal-consent__link" onClick={() => onShowLegal("terms")}>
        Terms of Service
      </button>
      {" "}and{" "}
      <button type="button" className="auth-legal-consent__link" onClick={() => onShowLegal("privacy")}>
        Privacy Policy
      </button>
      .
    </p>
  );
}
