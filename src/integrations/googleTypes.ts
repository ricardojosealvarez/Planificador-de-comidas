export interface GoogleTokenResponse {
  readonly access_token?: string;
  readonly error?: string;
}

export interface GoogleTokenClient {
  readonly requestAccessToken: () => void;
}

export interface GoogleTokenClientConfig {
  readonly client_id: string;
  readonly scope: string;
  readonly callback: (response: GoogleTokenResponse) => void;
  readonly error_callback?: (error: Error) => void;
}

export interface GoogleAccountsOauth2 {
  readonly initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
}

export interface GoogleAccounts {
  readonly oauth2: GoogleAccountsOauth2;
}

export interface GoogleNamespace {
  readonly accounts: GoogleAccounts;
}

declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}
