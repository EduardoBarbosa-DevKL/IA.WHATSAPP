import Image from "next/image";
import BarbershopBackground from "../components/BarbershopBackground";

export default function HomePage() {
  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center px-6">
      <BarbershopBackground />

      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface/80 p-10 text-center shadow-sm backdrop-blur-sm">
        <Image
  src="/images/esse.png"
  alt="Logo"
  width={320}
  height={320}
  priority
  className="mx-auto mb-6 block h-auto w-52 sm:w-64"
/>

        <h1 className="mt-2 font-display text-3xl font-medium text-ink sm:text-4xl">
          Nunca mais perca um horário vago
        </h1>

        <p className="mt-4 text-base leading-relaxed text-muted">
          Gerencie a fila do seu estabelecimento e avise automaticamente o
          próximo cliente assim que um horário abrir.
        </p>

        <a href="/login" className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 sm:w-auto">Entrar no painel</a>
      </div>
    </main>
  );
}