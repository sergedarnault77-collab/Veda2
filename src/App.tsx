import { useState, useCallback, useEffect } from "react";
import RegisterScreen from "./auth/RegisterScreen";
import LoginScreen from "./auth/LoginScreen";
import ProfileScreen from "./auth/ProfileScreen";
import PlanScreen from "./auth/PlanScreen";
import HomePage from "./home/HomePage";
import DashboardPage from "./dashboard/DashboardPage";
import MedicationsPage from "./meds/MedicationsPage";
import SupplementsPage from "./supps/SupplementsPage";
import PrivacyPolicy from "./legal/PrivacyPolicy";
import TermsOfService from "./legal/TermsOfService";
import { loadUser, saveUser, setPlan as persistPlan, setProfile as persistProfile } from "./lib/auth";
import type { VedaUser, Plan, BiologicalSex, AgeRange } from "./lib/auth";
import { supabase } from "./lib/supabase";
import { setSyncEmail, pullAll, pushAll } from "./lib/sync";
import "./App.css";

type AuthView = "register" | "login";
type Tab = "home" | "dashboard" | "meds" | "supps";
type LegalView = "privacy" | "terms" | null;
type Theme = "dark" | "light";

const THEME_KEY = "veda.theme";

function loadTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem(THEME_KEY) as Theme) || "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function App() {
  const [user, setUser] = useState<VedaUser | null>(() => loadUser());
  const [authView, setAuthView] = useState<AuthView>("register");
  const [tab, setTab] = useState<Tab>("home");
  const [legalView, setLegalView] = useState<LegalView>(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "privacy") return "privacy";
    if (h === "terms") return "terms";
    return null;
  });
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const t = loadTheme();
    applyTheme(t);
    return t;
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  // Restore Supabase session on app load / OAuth redirect
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    try {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user && !user) {
          restoreFromSupabaseUser(session.user);
        }
      }).catch(() => {});

      const resp = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (session?.user && !user) {
            restoreFromSupabaseUser(session.user);
          }
        },
      );
      subscription = resp.data.subscription;
    } catch (err) {
      console.warn("[Supabase] Auth listener failed:", err);
    }

    return () => subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restoreFromSupabaseUser(supaUser: { email?: string | null; user_metadata?: Record<string, any> }) {
    const email = supaUser.email ?? "";
    if (!email) return;

    setSyncEmail(email);
    setSyncing(true);
    pullAll().then(() => {
      const stored = loadUser();
      if (stored && stored.email === email) {
        setUser(stored);
      } else {
        const meta = supaUser.user_metadata ?? {};
        const restored: VedaUser = {
          firstName: meta.first_name || meta.full_name?.split(" ")[0] || "User",
          lastName: meta.last_name || meta.full_name?.split(" ").slice(1).join(" ") || "",
          email,
          country: meta.country || "",
          city: meta.city || "",
          plan: null,
          sex: null,
          heightCm: null,
          weightKg: null,
          ageRange: null,
          profileComplete: false,
          createdAt: new Date().toISOString(),
        };
        saveUser(restored);
        setUser(restored);
      }
    }).finally(() => setSyncing(false));
  }

  // Set sync email whenever user changes, pull from server
  useEffect(() => {
    if (user?.email) {
      setSyncEmail(user.email);
      setSyncing(true);
      pullAll()
        .finally(() => setSyncing(false));
    } else {
      setSyncEmail(null);
    }
  }, [user?.email]);

  const isRegistered = user !== null;
  const hasProfile = isRegistered && user.profileComplete === true;
  const hasPlan = isRegistered && user.plan !== null;
  const isAI = user?.plan === "ai";

  const handleRegister = useCallback((u: VedaUser) => {
    saveUser(u);
    setUser(u);
    setSyncEmail(u.email);
    pushAll();
  }, []);

  const handleLogin = useCallback((u: VedaUser) => {
    setUser(u);
    setSyncEmail(u.email);
    // Pull will happen via the useEffect above
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

  const clearLocalData = useCallback(() => {
    localStorage.removeItem("veda.user.v1");
    localStorage.removeItem("veda.supps.v1");
    localStorage.removeItem("veda.meds.v1");
    localStorage.removeItem("veda.exposure.today.v1");
    localStorage.removeItem("veda.scans.today.v1");
    localStorage.removeItem("veda.supps.taken.v1");
    localStorage.removeItem("veda.exposure.history.v1");
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
    setSyncEmail(null);
    setUser(null);
    setAuthView("login");
    clearLocalData();
  }, [clearLocalData]);

  const handleDeleteAccount = useCallback(async () => {
    const email = user?.email;
    if (!email) return;

    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, action: "delete_account" }),
      });
    } catch { /* proceed with local cleanup even if server fails */ }

    await supabase.auth.signOut().catch(() => {});
    setSyncEmail(null);
    setUser(null);
    setAuthView("register");
    clearLocalData();
  }, [user?.email, clearLocalData]);

  // 0. Legal pages — accessible without login (for store review links)
  if (legalView === "privacy") {
    return <PrivacyPolicy onBack={() => { setLegalView(null); window.location.hash = ""; }} />;
  }
  if (legalView === "terms") {
    return <TermsOfService onBack={() => { setLegalView(null); window.location.hash = ""; }} />;
  }

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
        <button onClick={() => setTab("dashboard")} className={`app-nav__btn ${tab === "dashboard" ? "app-nav__btn--active" : ""}`}>Dashboard</button>
        <button onClick={() => setTab("supps")} className={`app-nav__btn ${tab === "supps" ? "app-nav__btn--active" : ""}`}>Supps</button>
        <button onClick={() => setTab("meds")} className={`app-nav__btn ${tab === "meds" ? "app-nav__btn--active" : ""}`}>Meds</button>
      </nav>

      <div className="app-content">
        {tab === "home" && <HomePage isAI={isAI} userName={user.firstName} />}
        {tab === "dashboard" && <DashboardPage />}
        {tab === "meds" && <MedicationsPage />}
        {tab === "supps" && <SupplementsPage />}
      </div>

      {/* Account bar */}
      <AccountBar
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onChangePlan={handleChangePlan}
        onUpdateUser={(updated) => { saveUser(updated); setUser(updated); }}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        onShowLegal={(view) => { setLegalView(view); window.location.hash = view; }}
      />
    </div>
  );
}

/* ── Account bar (small, top-right or bottom drawer) ── */

function AccountBar({
  user,
  theme,
  onToggleTheme,
  onChangePlan,
  onUpdateUser,
  onLogout,
  onDeleteAccount,
  onShowLegal,
}: {
  user: VedaUser;
  theme: Theme;
  onToggleTheme: () => void;
  onChangePlan: (plan: Plan) => void;
  onUpdateUser: (u: VedaUser) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onShowLegal: (view: "privacy" | "terms") => void;
}) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const planLabel = user.plan === "ai" ? "Veda AI" : "Freemium";
  const otherPlan: Plan = user.plan === "ai" ? "freemium" : "ai";
  const otherLabel = user.plan === "ai" ? "Freemium" : "Veda AI";

  const btnBorder = theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const btnBg = theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";

  const btnStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    fontSize: "0.82rem",
    fontWeight: 600,
    borderRadius: 12,
    border: `1px solid ${btnBorder}`,
    background: btnBg,
    color: "var(--veda-text)",
    cursor: "pointer",
    marginBottom: 8,
    fontFamily: "inherit",
  };

  return (
    <>
      <button
        onClick={() => { setOpen((v) => !v); setShowProfile(false); }}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 100,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: `1px solid ${theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"}`,
          background: theme === "dark"
            ? "linear-gradient(135deg, rgba(46,91,255,0.3), rgba(90,128,255,0.15))"
            : "linear-gradient(135deg, rgba(46,91,255,0.2), rgba(46,91,255,0.08))",
          color: theme === "dark" ? "#fff" : "#1a1a2e",
          fontWeight: 700,
          fontSize: "0.82rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: theme === "dark" ? "0 4px 16px rgba(0,0,0,0.35)" : "0 4px 16px rgba(0,0,0,0.08)",
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
            width: showProfile ? 310 : 260,
            maxHeight: "80vh",
            overflowY: "auto",
            padding: "20px",
            borderRadius: 20,
            background: theme === "dark" ? "rgba(10,14,28,0.94)" : "rgba(255,255,255,0.95)",
            border: `1px solid ${btnBorder}`,
            boxShadow: theme === "dark" ? "0 16px 48px rgba(0,0,0,0.6)" : "0 16px 48px rgba(0,0,0,0.12)",
            backdropFilter: "blur(20px)",
          }}
        >
          {showProfile ? (
            <ProfilePanel user={user} theme={theme} onSave={(u) => { onUpdateUser(u); setShowProfile(false); }} onBack={() => setShowProfile(false)} />
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: 2, color: "var(--veda-text)" }}>
                {user.firstName} {user.lastName}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--veda-text-muted)", marginBottom: 4 }}>
                {user.email}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--veda-text-muted)", marginBottom: 16 }}>
                Plan: <strong>{planLabel}</strong> · {user.country}
              </div>

              <button onClick={() => setShowProfile(true)} style={btnStyle}>
                My Profile
              </button>

              <button
                onClick={onToggleTheme}
                style={{ ...btnStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {theme === "dark" ? "☀️" : "🌙"} Switch to {theme === "dark" ? "Day" : "Night"} mode
              </button>

              <button onClick={() => { onChangePlan(otherPlan); setOpen(false); }} style={btnStyle}>
                Switch to {otherLabel}
              </button>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => { onShowLegal("privacy"); setOpen(false); }}
                  style={{ ...btnStyle, fontSize: "0.72rem", padding: "8px 10px", flex: 1, marginBottom: 0 }}
                >
                  Privacy Policy
                </button>
                <button
                  onClick={() => { onShowLegal("terms"); setOpen(false); }}
                  style={{ ...btnStyle, fontSize: "0.72rem", padding: "8px 10px", flex: 1, marginBottom: 0 }}
                >
                  Terms of Service
                </button>
              </div>

              <button
                onClick={() => { onLogout(); setOpen(false); }}
                style={{
                  ...btnStyle,
                  border: "1px solid rgba(240,98,146,0.2)",
                  background: "rgba(240,98,146,0.06)",
                  color: "var(--veda-red)",
                }}
              >
                Log out
              </button>

              <button
                onClick={() => {
                  if (window.confirm("Delete your account and all data? This cannot be undone.")) {
                    onDeleteAccount();
                    setOpen(false);
                  }
                }}
                style={{
                  ...btnStyle,
                  border: "1px solid rgba(240,98,146,0.3)",
                  background: "rgba(240,98,146,0.08)",
                  color: "var(--veda-red)",
                  fontSize: "0.72rem",
                  marginBottom: 0,
                }}
              >
                Delete Account
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ── Profile panel (inline in account dropdown) ── */

const AGE_RANGES: AgeRange[] = ["18-25", "26-35", "36-45", "46-55", "56-65", "65+"];
const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function ProfilePanel({
  user,
  theme,
  onSave,
  onBack,
}: {
  user: VedaUser;
  theme: string;
  onSave: (u: VedaUser) => void;
  onBack: () => void;
}) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [country, setCountry] = useState(user.country);
  const [city, setCity] = useState(user.city);
  const [sex, setSex] = useState<BiologicalSex | null>(user.sex);
  const [ageRange, setAgeRange] = useState<AgeRange | null>(user.ageRange);
  const [heightCm, setHeightCm] = useState(user.heightCm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(user.weightKg?.toString() ?? "");
  const [saved, setSaved] = useState(false);

  const isDark = theme === "dark";
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    fontSize: "0.82rem",
    fontFamily: "inherit",
    borderRadius: 10,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"}`,
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    color: "var(--veda-text)",
    outline: "none",
    boxSizing: "border-box" as const,
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.68rem",
    fontWeight: 600,
    color: "var(--veda-text-muted)",
    marginBottom: 3,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  };
  const rowStyle: React.CSSProperties = { marginBottom: 10 };

  function handleSave() {
    const updated: VedaUser = {
      ...user,
      firstName: firstName.trim() || user.firstName,
      lastName: lastName.trim() || user.lastName,
      country: country.trim() || user.country,
      city: city.trim() || user.city,
      sex,
      ageRange,
      heightCm: heightCm ? Number(heightCm) : user.heightCm,
      weightKg: weightKg ? Number(weightKg) : user.weightKg,
    };
    onSave(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "var(--veda-accent)",
          fontSize: "0.78rem",
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          marginBottom: 12,
          fontFamily: "inherit",
        }}
      >
        ← Back
      </button>

      <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 14, color: "var(--veda-text)" }}>
        My Profile
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 2 }}>
        <div style={rowStyle}>
          <label style={labelStyle}>First name</label>
          <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>Last name</label>
          <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Email</label>
        <input style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} value={user.email} readOnly />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 2 }}>
        <div style={rowStyle}>
          <label style={labelStyle}>Country</label>
          <input style={inputStyle} value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>City</label>
          <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Sex</label>
        <select
          style={inputStyle}
          value={sex ?? ""}
          onChange={(e) => setSex((e.target.value || null) as BiologicalSex | null)}
        >
          <option value="">—</option>
          {SEX_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Age range</label>
        <select
          style={inputStyle}
          value={ageRange ?? ""}
          onChange={(e) => setAgeRange((e.target.value || null) as AgeRange | null)}
        >
          <option value="">—</option>
          {AGE_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 2 }}>
        <div style={rowStyle}>
          <label style={labelStyle}>Height (cm)</label>
          <input style={inputStyle} type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>Weight (kg)</label>
          <input style={inputStyle} type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
        </div>
      </div>

      <button
        onClick={handleSave}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: "0.82rem",
          fontWeight: 700,
          borderRadius: 12,
          border: "none",
          background: "linear-gradient(135deg, var(--veda-accent), var(--veda-accent-light))",
          color: "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          marginTop: 4,
        }}
      >
        {saved ? "✓ Saved" : "Save changes"}
      </button>
    </div>
  );
}

