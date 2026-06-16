import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

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
    <div
      style={{ background: "oklch(0.97 0.008 80)", minHeight: "100vh" }}
      className="flex items-center justify-center px-4"
    >
      <div className="w-full max-w-sm">
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <img
            src="/logo.png"
            alt="Tilbudssystem"
            className="h-16 w-auto"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <div className="text-center">
            <div
              style={{ color: "oklch(0.14 0.004 80)", letterSpacing: "0.08em" }}
              className="text-base font-bold uppercase"
            >
              Tilbudssystem
            </div>
            <div
              style={{ color: "oklch(0.55 0.012 80)" }}
              className="mt-0.5 text-xs"
            >
              Tilbuds- og prosjektsystem
            </div>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "white",
            border: "1px solid oklch(0.90 0.015 80)",
            borderRadius: "10px",
            boxShadow: "0 1px 4px rgba(20,20,18,0.06), 0 4px 16px rgba(20,20,18,0.04)",
          }}
          className="p-8"
        >
          <h1
            style={{ color: "oklch(0.14 0.004 80)" }}
            className="mb-6 text-base font-semibold"
          >
            {mode === "signin" ? "Logg inn" : "Opprett konto"}
          </h1>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                style={{ color: "oklch(0.55 0.012 80)", letterSpacing: "0.04em" }}
                className="mb-1.5 block text-[11px] font-600 uppercase font-semibold"
              >
                E-post
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  height: "38px",
                  border: "1px solid oklch(0.84 0.02 80)",
                  borderRadius: "6px",
                  padding: "0 12px",
                  fontSize: "13.5px",
                  width: "100%",
                  outline: "none",
                  color: "oklch(0.14 0.004 80)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "oklch(0.49 0.22 27)";
                  e.target.style.boxShadow = "0 0 0 3px oklch(0.95 0.03 27)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "oklch(0.84 0.02 80)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{ color: "oklch(0.55 0.012 80)", letterSpacing: "0.04em" }}
                className="mb-1.5 block text-[11px] font-semibold uppercase"
              >
                Passord
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                style={{
                  height: "38px",
                  border: "1px solid oklch(0.84 0.02 80)",
                  borderRadius: "6px",
                  padding: "0 12px",
                  fontSize: "13.5px",
                  width: "100%",
                  outline: "none",
                  color: "oklch(0.14 0.004 80)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "oklch(0.49 0.22 27)";
                  e.target.style.boxShadow = "0 0 0 3px oklch(0.95 0.03 27)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "oklch(0.84 0.02 80)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                height: "38px",
                width: "100%",
                background: loading ? "oklch(0.7 0.1 27)" : "oklch(0.49 0.22 27)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "8px",
                transition: "background 80ms",
              }}
              onMouseEnter={(e) => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.43 0.22 27)";
              }}
              onMouseLeave={(e) => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.49 0.22 27)";
              }}
            >
              {loading ? "Vent…" : mode === "signin" ? "Logg inn" : "Opprett konto"}
            </button>
          </form>

          <div
            style={{ color: "oklch(0.55 0.012 80)" }}
            className="mt-5 text-center text-xs"
          >
            {mode === "signin" ? (
              <>
                Ikke registrert?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  style={{ color: "oklch(0.49 0.22 27)", fontWeight: 600 }}
                  className="hover:underline"
                >
                  Opprett konto
                </button>
              </>
            ) : (
              <>
                Har konto?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  style={{ color: "oklch(0.49 0.22 27)", fontWeight: 600 }}
                  className="hover:underline"
                >
                  Logg inn
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
