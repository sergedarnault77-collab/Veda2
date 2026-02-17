import { useState, useCallback } from "react";
import RegisterScreen from "./auth/RegisterScreen";
import LoginScreen from "./auth/LoginScreen";
import ProfileScreen from "./auth/ProfileScreen";
import PlanScreen from "./auth/PlanScreen";
import HomePage from "./home/HomePage";
import MedicationsPage from "./meds/MedicationsPage";
import SupplementsPage from "./supps/SupplementsPage";
import { loadUser, saveUser, setPlan as persistPlan, setProfile as persistProfile } from "./lib/auth";
import type { VedaUser, Plan, BiologicalSex, AgeRange } from "./lib/auth";
import "./App.css";

type AuthView = "register" | "login";
type Tab = "home" | "meds" | "supps";

export default function App() {
  const [user, setUser] = useState<VedaUser | null>(() => loadUser());
  const [authView, setAuthView] = useState<AuthView>("register");
  const [tab, setTab] = useState<Tab>("home");

  const isRegistered = user !== null;
  const hasProfile = isRegistered && user.profileComplete === true;
  const hasPlan = isRegistered && user.plan !== null;
  const isAI = user?.plan === "ai";

  const handleRegister = useCallback((u: VedaUser) => {
    saveUser(u);
    setUser(u);
  }, []);

  const handleLogin = useCallback((u: VedaUser) => {
    setUser(u);
  }, []);

  const handleProfileComplete = useCallback((profile: {
    sex: BiologicalSex | null;
    heightCm: number | null;
    weightKg: number | null;
    ageRange: AgeRange | null;
  }) => {
    persistProfile(profile);
    setUser((prev) => prev ? {
      ...prev,
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      ageRange: profile.ageRange,
      profileComplete: true,
    } : prev);
  }, []);

  const handleSelectPlan = useCallback((plan: Plan) => {
    persistPlan(plan);
    setUser((prev) => prev ? { ...prev, plan } : prev);
    if (plan === "ai") setTab("home");
  }, []);

  const handleChangePlan = useCallback((plan: Plan) => {
    persistPlan(plan);
    setUser((prev) => prev ? { ...prev, plan } : prev);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setAuthView("login");
  }, []);

  // 1. Not registered → show auth screen
  if (!isRegistered) {
    if (authView === "login") {
      return (
        <LoginScreen
          onLogin={handleLogin}
          onGoToRegister={() => setAuthView("register")}
        />
      );
    }
    return (
      <RegisterScreen
        onRegister={handleRegister}
        onGoToLogin={() => setAuthView("login")}
      />
    );
  }

  // 2. Registered but profile not complete → body data screen
  if (!hasProfile) {
    return (
      <ProfileScreen
        firstName={user.firstName}
        onComplete={handleProfileComplete}
      />
    );
  }

  // 3. Profile complete but no plan → forced plan selection
  if (!hasPlan) {
    return <PlanScreen onSelect={handleSelectPlan} />;
  }

  // 3. Has plan → main app (with feature gating)
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-nav__logo">Veda</div>
        <button onClick={() => setTab("home")} className={`app-nav__btn ${tab === "home" ? "app-nav__btn--active" : ""}`}>Scan</button>
        <button onClick={() => setTab("supps")} className={`app-nav__btn ${tab === "supps" ? "app-nav__btn--active" : ""}`}>Supplements</button>
        <button onClick={() => setTab("meds")} className={`app-nav__btn ${tab === "meds" ? "app-nav__btn--active" : ""}`}>Meds</button>
      </nav>

      <div className="app-content">
        {tab === "home" && <HomePage isAI={isAI} userName={user.firstName} />}
        {tab === "meds" && <MedicationsPage />}
        {tab === "supps" && <SupplementsPage />}
      </div>

      {/* Account bar */}
      <AccountBar
        user={user}
        onChangePlan={handleChangePlan}
        onLogout={handleLogout}
      />
    </div>
  );
}

/* ── Account bar (small, top-right or bottom drawer) ── */

function AccountBar({
  user,
  onChangePlan,
  onLogout,
}: {
  user: VedaUser;
  onChangePlan: (plan: Plan) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const planLabel = user.plan === "ai" ? "Veda AI" : "Freemium";
  const otherPlan: Plan = user.plan === "ai" ? "freemium" : "ai";
  const otherLabel = user.plan === "ai" ? "Freemium" : "Veda AI";

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 100,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "linear-gradient(135deg, rgba(124,108,240,0.3), rgba(162,155,254,0.15))",
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.82rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}
        aria-label="Account"
      >
        {user.firstName.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 60,
            right: 16,
            zIndex: 100,
            width: 260,
            padding: "20px",
            borderRadius: 20,
            background: "rgba(16,16,38,0.92)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: 2 }}>
            {user.firstName} {user.lastName}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--veda-text-muted)", marginBottom: 4 }}>
            {user.email}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--veda-text-muted)", marginBottom: 16 }}>
            Plan: <strong>{planLabel}</strong> · {user.country}
          </div>

          <button
            onClick={() => {
              onChangePlan(otherPlan);
              setOpen(false);
            }}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "0.82rem",
              fontWeight: 600,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--veda-text)",
              cursor: "pointer",
              marginBottom: 8,
              fontFamily: "inherit",
            }}
          >
            Switch to {otherLabel}
          </button>

          <button
            onClick={() => {
              onLogout();
              setOpen(false);
            }}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: "0.82rem",
              fontWeight: 600,
              borderRadius: 12,
              border: "1px solid rgba(240,98,146,0.2)",
              background: "rgba(240,98,146,0.06)",
              color: "var(--veda-red)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Log out
          </button>
        </div>
      )}
    </>
  );
}

