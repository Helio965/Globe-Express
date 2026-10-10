import type { Metadata } from "next";
import "@fontsource-variable/oswald";
import "./globals.css";

export const metadata: Metadata = { title: "World Explorer — Siga a sua curiosidade", description: "Explore lugares reais, descubra suas histórias e veja o mundo por uma nova perspectiva. Pesquisa geográfica, mapas e fotografias com fontes." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
