import type { Metadata, Viewport } from 'next';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import 'leaflet/dist/leaflet.css';
import '@/components/map/map.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'World Explorer — O mundo é só o começo',
  description: 'Encontre um lugar. Mude de perspectiva. Explore o mundo com mapas interativos, fotografias e histórias de fontes reais.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#101815' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
