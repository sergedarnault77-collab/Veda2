import { useState } from "react";
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;

    const user: VedaUser = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
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
  }

  return (
    <div className="register">
      <div className="register__logo">Veda</div>
      <h1 className="register__title">Create your account</h1>
      <p className="register__sub">Track what you consume. Understand what it means.</p>

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

        <button type="submit" className="register__cta">
          Create account
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
