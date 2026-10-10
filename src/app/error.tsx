"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="fallback-page"><p className="eyebrow">WORLD EXPLORER</p><h1>Vamos tentar de novo.</h1><p>Algo interrompeu esta exploração. Suas descobertas salvas continuam no navegador.</p><button className="primary-button" onClick={reset}>Tentar novamente</button><Link href="/">Voltar ao início</Link></main>;
}
