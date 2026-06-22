import type { AppConfig } from './types';

export const appConfig: AppConfig = {
  recipesCsvUrl: import.meta.env.VITE_RECIPES_CSV_URL ?? '',
  ingredientsCsvUrl: import.meta.env.VITE_INGREDIENTS_CSV_URL ?? '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? '',
};

export const hasCatalogConfig = Boolean(appConfig.recipesCsvUrl && appConfig.ingredientsCsvUrl);

export const hasGoogleConfig = Boolean(appConfig.googleClientId && appConfig.googleApiKey);
