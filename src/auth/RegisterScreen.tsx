import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { VedaUser } from "../lib/auth";
import "./RegisterScreen.css";

const COUNTRIES = [
  "Australia", "Austria", "Belgium", "Brazil", "Canada", "China", "Denmark",
  "Finland", "France", "Germany", "India", "Indonesia", "Ireland", "Israel",
  "Italy", "Japan", "Mexico", "Netherlands", "New Zealand", "Norway", "Poland",
  "Portugal", "Singapore", "South Africa", "South Korea", "Spain", "Sweden",
  "Switzerland", "Thailand", "Turkey", "United Arab Emirates", "United Kingdom",
  "United States", "Other",
];

interface Props {
  onRegister: (user: VedaUser) => void;
  onGoToLogin: () => void;
}

export default function RegisterScreen({ onRegister, onGoToLogin }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function validate(): string[] {
    const errs: string[] = [];
    if (!firstName.trim()) errs.push("First name is required.");
    if (!lastName.trim()) errs.push("Last name is required.");
    if (!email.trim()) errs.push("Email is required.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.push("Email format is not valid.");
    if (!password) errs.push("Password is required.");
    else if (password.length < 6) errs.push("Password must be at least 6 characters.");
    if (password !== confirmPassword) errs.push("Passwords do not match.");
    if (!country) errs.push("Country must be selected.");
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            country,
            city: city.trim(),
          },
        },
      });

      if (error) {
        setErrors([error.message]);
        return;
      }

      if (!data.user) {
        setErrors(["Registration failed. Please try again."]);
        return;
      }

      const user: VedaUser = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: data.user.email ?? email.trim().toLowerCase(),
        country,
        city: city.trim(),
        plan: null,
        sex: null,
        heightCm: null,
        weightKg: null,
        ageRange: null,
        profileComplete: false,
        createdAt: new Date().toISOString(),
      };
      onRegister(user);
    } catch (err: any) {
      setErrors([err?.message || "Something went wrong."]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: "apple" | "google") {
    setErrors([]);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) setErrors([error.message]);
  }

  return (
    <div className="register">
      <div className="register__logo">Veda</div>
      <h1 className="register__title">Create your account</h1>
      <p className="register__sub">Track what you consume. Understand what it means.</p>

      <div className="register__social">
        <button
          type="button"
          className="register__social-btn register__social-btn--apple"
          onClick={() => handleSocialLogin("apple")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Continue with Apple
        </button>
        <button
          type="button"
          className="register__social-btn register__social-btn--google"
          onClick={() => handleSocialLogin("google")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
      </div>

      <div className="register__divider">
        <span>or</span>
      </div>

      <form className="register__form" onSubmit={handleSubmit} noValidate>
        <div className="register__row">
          <div className="register__field">
            <label className="register__label">First name</label>
            <input
              className="register__input"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div className="register__field">
            <label className="register__label">Last name</label>
            <input
              className="register__input"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div className="register__field">
          <label className="register__label">Email address</label>
          <input
            className="register__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="register__row">
          <div className="register__field">
            <label className="register__label">Password</label>
            <input
              className="register__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="register__field">
            <label className="register__label">Confirm password</label>
            <input
              className="register__input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="register__field">
          <label className="register__label">Country</label>
          <select
            className="register__input register__select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Select country…</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="register__field">
          <label className="register__label">
            City or region <span className="register__optional">(optional)</span>
          </label>
          <input
            className="register__input"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
          />
        </div>

        {errors.length > 0 && (
          <div className="register__errors">
            {errors.map((err, i) => (
              <div key={i} className="register__error">{err}</div>
            ))}
          </div>
        )}

        <button type="submit" className="register__cta" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>

        <div className="register__login">
          Already have an account?{" "}
          <button type="button" className="register__loginLink" onClick={onGoToLogin}>
            Log in
          </button>
        </div>
      </form>
    </div>
  );
}
