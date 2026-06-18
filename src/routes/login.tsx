import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const styles = `
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes gridScroll {
  from { background-position: 0 0; }
  to   { background-position: 40px 40px; }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.0), 0 0 20px 4px rgba(220,38,38,0.12); }
  50%       { box-shadow: 0 0 0 6px rgba(220,38,38,0.0), 0 0 32px 8px rgba(220,38,38,0.22); }
}
@keyframes scanLine {
  0%   { transform: translateY(-100%); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateY(800%); opacity: 0; }
}
@keyframes dotBlink {
  0%, 80%, 100% { opacity: 0; transform: scale(0.6); }
  40%           { opacity: 1; transform: scale(1); }
}
@keyframes redLine {
  from { width: 0; }
  to   { width: 2.5rem; }
}

.login-bg {
  background-color: #080808;
  background-image:
    linear-gradient(rgba(220,38,38,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(220,38,38,0.04) 1px, transparent 1px);
  background-size: 40px 40px;
  animation: gridScroll 8s linear infinite;
  position: relative;
  overflow: hidden;
}
.login-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 50%, rgba(220,38,38,0.06) 0%, transparent 70%);
  pointer-events: none;
}
.login-bg::after {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(220,38,38,0.6), transparent);
  animation: scanLine 6s ease-in-out infinite;
  animation-delay: 1s;
  pointer-events: none;
}
.login-card {
  animation: fadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1) both;
  animation-delay: 0.1s;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
.login-logo-wrap {
  animation: glowPulse 3s ease-in-out infinite;
  border-radius: 16px;
}
.login-brand {
  animation: fadeIn 0.6s ease both;
  animation-delay: 0.3s;
}
.login-accent-bar {
  animation: redLine 0.5s cubic-bezier(0.22,1,0.36,1) both;
  animation-delay: 0.5s;
}
.login-form {
  animation: fadeIn 0.5s ease both;
  animation-delay: 0.4s;
}
.login-input {
  width: 100%;
  height: 44px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 0 14px;
  font-size: 14px;
  color: #f0f0f0;
  outline: none;
  transition: border-color 150ms, box-shadow 150ms, background 150ms;
}
.login-input::placeholder { color: rgba(255,255,255,0.25); }
.login-input:focus {
  border-color: rgba(220,38,38,0.7);
  box-shadow: 0 0 0 3px rgba(220,38,38,0.15);
  background: rgba(255,255,255,0.07);
}
.login-btn {
  width: 100%;
  height: 44px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 150ms, transform 100ms, box-shadow 150ms;
  position: relative;
  overflow: hidden;
}
.login-btn:hover:not(:disabled) {
  background: #b91c1c;
  box-shadow: 0 0 20px rgba(220,38,38,0.35);
  transform: translateY(-1px);
}
.login-btn:active:not(:disabled) { transform: translateY(0); }
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: white; margin: 0 2px; }
.dot:nth-child(1) { animation: dotBlink 1.2s ease-in-out infinite; animation-delay: 0s; }
.dot:nth-child(2) { animation: dotBlink 1.2s ease-in-out infinite; animation-delay: 0.2s; }
.dot:nth-child(3) { animation: dotBlink 1.2s ease-in-out infinite; animation-delay: 0.4s; }

.login-toggle-btn {
  background: none; border: none; cursor: pointer;
  color: #dc2626; font-weight: 600; font-size: 12px;
  padding: 0; transition: opacity 150ms;
}
.login-toggle-btn:hover { opacity: 0.75; text-decoration: underline; }

.login-label {
  display: block;
  margin-bottom: 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
}
`;

function LoadingDots() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </span>
  );
}

function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    setLoading(false);
    if (error) { toast.error(error); return; }
    toast.success(mode === "signup" ? "Konto opprettet" : "Innlogget");
    navigate({ to: "/" });
  };

  return (
    <>
      <style>{styles}</style>
      <div className="login-bg flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="login-card w-full max-w-sm rounded-2xl p-8">

          {/* Brand */}
          <div className="login-brand mb-8 flex flex-col items-center gap-4">
            <div className="login-logo-wrap">
              <img
                src="/logo.png"
                alt="Techauge"
                style={{ height: 56, width: "auto", display: "block", borderRadius: 12 }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#f5f5f5",
              }}>
                TECHAUGE
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 3, letterSpacing: "0.04em" }}>
                Tilbuds- og prosjektsystem
              </div>
            </div>
          </div>

          {/* Heading + red accent */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f5f5f5", marginBottom: 8, letterSpacing: "-0.01em" }}>
              {mode === "signin" ? "Logg inn" : "Opprett konto"}
            </h1>
            <div className="login-accent-bar" style={{ height: 2, background: "#dc2626", borderRadius: 2 }} />
          </div>

          {/* Form */}
          <form onSubmit={submit} className="login-form" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label htmlFor="email" className="login-label">E-post</label>
              <input
                id="email"
                className="login-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="du@eksempel.no"
              />
            </div>

            <div>
              <label htmlFor="password" className="login-label">Passord</label>
              <input
                id="password"
                className="login-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <LoadingDots /> : mode === "signin" ? "Logg inn" : "Opprett konto"}
            </button>
          </form>

          {/* Toggle */}
          <div style={{ marginTop: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            {mode === "signin" ? (
              <>
                Ikke registrert?{" "}
                <button type="button" className="login-toggle-btn" onClick={() => setMode("signup")}>
                  Opprett konto
                </button>
              </>
            ) : (
              <>
                Har konto?{" "}
                <button type="button" className="login-toggle-btn" onClick={() => setMode("signin")}>
                  Logg inn
                </button>
              </>
            )}
          </div>

        </div>

        {/* Bottom signature */}
        <div style={{
          position: "fixed", bottom: 20, left: 0, right: 0,
          textAlign: "center", fontSize: 10.5,
          color: "rgba(255,255,255,0.15)", letterSpacing: "0.06em",
        }}>
          POWERED BY TECHAUGE
        </div>
      </div>
    </>
  );
}
