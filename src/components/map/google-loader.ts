export const GOOGLE_MAPS_AUTH_FAILURE = 'world-explorer-google-auth-failure';

declare global {
  interface Window {
    __worldExplorerMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

export class GoogleMapError extends Error {
  constructor(message: string, public readonly reason: 'missing-key' | 'network' | 'authentication') {
    super(message);
    this.name = 'GoogleMapError';
  }
}

let pending: Promise<typeof google.maps> | null = null;
let authenticationFailed = false;
let authenticationHandlerInstalled = false;
let rejectAuthentication: ((error: GoogleMapError) => void) | undefined;

export function loadGoogleMaps(): Promise<typeof google.maps> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return Promise.reject(new GoogleMapError('O Google Maps precisa de uma chave de acesso para exibir o mapa.', 'missing-key'));
  if (authenticationFailed) return Promise.reject(new GoogleMapError('Google Maps indisponível. A chave de acesso precisa ser verificada.', 'authentication'));
  if (typeof google !== 'undefined' && google.maps?.Map) return Promise.resolve(google.maps);
  if (pending) return pending;

  if (!authenticationHandlerInstalled) {
    const previousHandler = window.gm_authFailure;
    window.gm_authFailure = () => {
      authenticationFailed = true;
      rejectAuthentication?.(new GoogleMapError('Google Maps indisponível. A chave de acesso precisa ser verificada.', 'authentication'));
      window.dispatchEvent(new Event(GOOGLE_MAPS_AUTH_FAILURE));
      previousHandler?.();
    };
    authenticationHandlerInstalled = true;
  }

  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'world-explorer-google-maps';
    script.async = true;
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    if (nonce) script.nonce = nonce;
    const parameters = new URLSearchParams({ key, callback: '__worldExplorerMapsReady', loading: 'async', v: 'weekly', language: 'pt', region: 'BR' });
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;

    const fail = (error: GoogleMapError) => {
      window.clearTimeout(timeout);
      rejectAuthentication = undefined;
      window.__worldExplorerMapsReady = undefined;
      script.remove();
      pending = null;
      reject(error);
    };
    const timeout = window.setTimeout(() => fail(new GoogleMapError('O mapa demorou para responder. Verifique sua conexão e tente novamente.', 'network')), 20_000);
    rejectAuthentication = fail;
    script.onerror = () => fail(new GoogleMapError('Não foi possível conectar ao Google Maps. Tente novamente.', 'network'));
    window.__worldExplorerMapsReady = () => {
      window.clearTimeout(timeout);
      rejectAuthentication = undefined;
      if (authenticationFailed || typeof google === 'undefined' || !google.maps?.Map) {
        fail(new GoogleMapError('Não foi possível iniciar o Google Maps.', authenticationFailed ? 'authentication' : 'network'));
        return;
      }
      resolve(google.maps);
    };
    document.head.appendChild(script);
  });
  return pending;
}
