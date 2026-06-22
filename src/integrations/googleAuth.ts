import type { GoogleTokenClient, GoogleTokenResponse } from './googleTypes';

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

export interface GoogleAuthClient {
  readonly getAccessToken: () => Promise<string>;
}

export async function createGoogleAuthClient(clientId: string): Promise<GoogleAuthClient> {
  await loadGoogleIdentityScript();

  if (!window.google) {
    throw new Error('Google Identity Services no está disponible');
  }

  const google = window.google;
  let tokenClient: GoogleTokenClient | null = null;

  return {
    getAccessToken: () =>
      new Promise<string>((resolve, reject) => {
        tokenClient =
          tokenClient ??
          google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GOOGLE_DRIVE_FILE_SCOPE,
            callback: (response: GoogleTokenResponse) => {
              if (response.error || !response.access_token) {
                reject(new Error(response.error ?? 'No se pudo obtener token de Google'));
                return;
              }

              resolve(response.access_token);
            },
            error_callback: reject,
          });

        tokenClient.requestAccessToken();
      }),
  };
}

function loadGoogleIdentityScript(): Promise<void> {
  const currentScript = document.querySelector<HTMLScriptElement>(
    `script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`,
  );

  if (currentScript) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
    document.head.appendChild(script);
  });
}
