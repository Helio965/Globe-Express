import type { ExplorerConfig } from '@/types/explorer';
export function getExplorerConfig(): ExplorerConfig {
  const googleBrowserKeyPresent = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
  const googleServerKeyPresent = Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim());
  const googleConfigured = googleBrowserKeyPresent && googleServerKeyPresent;
  return { mapProvider: googleConfigured ? 'google' : 'open', googleConfigured, googleBrowserKeyPresent, googleServerKeyPresent };
}
