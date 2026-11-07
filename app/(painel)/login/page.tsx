"use client";
import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Preencha e-mail e senha.");
      return;
    }

    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!result) {
        setError("Erro inesperado ao tentar entrar. Tente novamente.");
        return;
      }

      if (result.error) {
        if (result.code === "rate_limited") {
          setError("Muitas tentativas de login. Aguarde cerca de 15 minutos e tente novamente.");
        } else {
          setError("E-mail ou senha inválidos.");
        }
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-accentSoft/40 via-bg to-bg px-6 py-16">
      <Link href="/" className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6">
        <Image src="/images/esse.png" alt="Logo" width={320} height={320} priority className="h-auto w-36 sm:w-48" />
      </Link>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface/90 p-8 shadow-sm backdrop-blur-sm">
        <h1 className="font-display text-2xl font-medium text-ink">Entrar</h1>
        <p className="mt-1 text-sm text-inkMuted">Acesse o painel do seu estabelecimento.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">E-mail</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft disabled:opacity-60" />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-ink">Senha</label>
              <Link href="/esqueci-senha" className="text-xs font-medium text-accent hover:underline">Esqueci minha senha</Link>
            </div>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} className="w-full rounded-lg border border-border bg-white py-2 pl-3 pr-10 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft disabled:opacity-60" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex items-center px-3 text-inkMuted transition hover:text-ink">
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-dangerSoft px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <button type="submit" disabled={loading} className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}