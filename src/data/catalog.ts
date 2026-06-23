import type { Catalog, MealType, Recipe, RecipeIngredient } from '../types';
import { parseCsv, type CsvRow } from './csv';
import { sampleCatalog } from './sampleCatalog';

const CATALOG_CACHE_KEY = 'meal-planner.catalog.v1';
const GOOGLE_SHEETS_API_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export async function loadPublicCatalog(
  recipesCsvUrl: string,
  ingredientsCsvUrl: string,
): Promise<Catalog> {
  if (!recipesCsvUrl || !ingredientsCsvUrl) {
    return sampleCatalog;
  }

  try {
    const [recipesText, ingredientsText] = await Promise.all([
      fetchText(recipesCsvUrl),
      fetchText(ingredientsCsvUrl),
    ]);

    const catalog = normalizeCatalog({
      recipes: parseCsv(recipesText).map(mapRecipe),
      ingredients: parseCsv(ingredientsText).map(mapIngredient),
    });

    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
    return catalog;
  } catch (error) {
    const cachedCatalog = readCachedCatalog();

    if (cachedCatalog) {
      return cachedCatalog;
    }

    throw error;
  }
}

export async function loadGoogleSheetsCatalog(
  accessToken: string,
  apiKey: string,
  recipesSheetUrl: string,
  ingredientsSheetUrl: string,
): Promise<Catalog> {
  if (!recipesSheetUrl || !ingredientsSheetUrl) {
    throw new Error('Faltan VITE_RECIPES_CSV_URL y VITE_INGREDIENTS_CSV_URL en GitHub Actions');
  }

  try {
    const recipesRef = parseGoogleSheetReference(recipesSheetUrl);
    const ingredientsRef = parseGoogleSheetReference(ingredientsSheetUrl);

    if (recipesRef.spreadsheetId !== ingredientsRef.spreadsheetId) {
      throw new Error('Las hojas de recetas e ingredientes deben pertenecer al mismo fichero');
    }

    const sheetNames = await loadSheetNamesByGid(accessToken, apiKey, recipesRef.spreadsheetId);
    const recipesSheetName = sheetNames.get(recipesRef.gid);
    const ingredientsSheetName = sheetNames.get(ingredientsRef.gid);

    if (!recipesSheetName || !ingredientsSheetName) {
      throw new Error('No se encontraron las pestañas del catálogo en Google Sheets');
    }

    const [recipesValues, ingredientsValues] = await Promise.all([
      loadSheetValues(accessToken, apiKey, recipesRef.spreadsheetId, recipesSheetName),
      loadSheetValues(accessToken, apiKey, ingredientsRef.spreadsheetId, ingredientsSheetName),
    ]);

    const catalog = normalizeCatalog({
      recipes: mapSheetRows(recipesValues).map(mapRecipe),
      ingredients: mapSheetRows(ingredientsValues).map(mapIngredient),
    });

    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
    return catalog;
  } catch (error) {
    const cachedCatalog = readCachedCatalog();

    if (cachedCatalog) {
      return cachedCatalog;
    }

    throw error;
  }
}

function fetchText(url: string): Promise<string> {
  return fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${url}: ${response.status}`);
    }

    return response.text();
  });
}

async function loadSheetNamesByGid(
  accessToken: string,
  apiKey: string,
  spreadsheetId: string,
): Promise<Map<string, string>> {
  const response = await googleFetch<SpreadsheetMetadataResponse>(
    `${GOOGLE_SHEETS_API_BASE_URL}/${spreadsheetId}?fields=sheets.properties(sheetId,title)&key=${encodeURIComponent(apiKey)}`,
    accessToken,
  );

  return new Map(
    response.sheets.map((sheet) => [String(sheet.properties.sheetId), sheet.properties.title]),
  );
}

async function loadSheetValues(
  accessToken: string,
  apiKey: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'`);
  const response = await googleFetch<SheetValuesResponse>(
    `${GOOGLE_SHEETS_API_BASE_URL}/${spreadsheetId}/values/${range}?key=${encodeURIComponent(apiKey)}`,
    accessToken,
  );

  return response.values ?? [];
}

async function googleFetch<TResponse>(url: string, accessToken: string): Promise<TResponse> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheets error ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as TResponse;
}

function parseGoogleSheetReference(url: string): GoogleSheetReference {
  const spreadsheetIdMatch = url.match(/\/spreadsheets\/d\/([^/]+)/);
  const gid = new URL(url).searchParams.get('gid');

  if (!spreadsheetIdMatch?.[1] || !gid) {
    throw new Error('La URL del catálogo debe ser una URL de Google Sheets con gid');
  }

  return {
    spreadsheetId: spreadsheetIdMatch[1],
    gid,
  };
}

function mapSheetRows(values: readonly (readonly string[])[]): CsvRow[] {
  const [headers, ...rows] = values;

  if (!headers) {
    return [];
  }

  const normalizedHeaders = headers.map(normalizeHeader);

  return rows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) =>
      normalizedHeaders.reduce<CsvRow>((record, header, index) => {
        record[header] = row[index]?.trim() ?? '';
        return record;
      }, {}),
    );
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)/g, '');
}

function mapRecipe(row: CsvRow): Recipe {
  return {
    id: readField(row, ['id', 'recipe_id', 'receta_id', 'id_receta']),
    name: readField(row, [
      'name',
      'nombre',
      'receta',
      'recipe_name',
      'nombre_receta',
      'plato_normalizado',
    ]),
    category: readOptionalField(row, ['category', 'categoria', 'tipo']) ?? '',
    allowedMealTypes: parseAllowedMealTypes(
      readOptionalField(row, ['meal_type', 'momento_comida', 'momento', 'franja']),
    ),
    servings: toPositiveNumber(readOptionalField(row, ['servings', 'raciones', 'porciones']), 1),
    notes: readOptionalField(row, ['notes', 'notas', 'observaciones']),
  };
}

function mapIngredient(row: CsvRow): RecipeIngredient {
  const ingredientName = readField(row, [
    'ingredient_name',
    'nombre_ingrediente',
    'ingrediente',
    'ingredient',
  ]);

  return {
    recipeId: readField(row, ['recipe_id', 'receta_id', 'id_receta']),
    recipeName:
      readOptionalField(row, ['recipe_name', 'nombre_receta', 'receta', 'plato_normalizado']) ?? '',
    ingredientId:
      readOptionalField(row, ['ingredient_id', 'ingrediente_id', 'id_ingrediente']) ??
      normalizeId(ingredientName),
    ingredientName,
    category: readOptionalField(row, ['category', 'categoria', 'tipo']) ?? 'Sin categoría',
    quantity: toPositiveNumber(
      readOptionalField(row, ['quantity', 'cantidad', 'cantidad_indicada']),
      0,
    ),
    unit: readOptionalField(row, ['unit', 'unidad']) ?? '',
  };
}

function readField(row: CsvRow, names: readonly string[]): string {
  const value = readOptionalField(row, names);

  if (!value) {
    throw new Error(`Falta columna requerida: ${names.join(' / ')}`);
  }

  return value;
}

function readOptionalField(row: CsvRow, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = row[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function toPositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const rangeMatch = value.match(/^\s*(\d+(?:[,.]\d+)?)\s*-\s*(\d+(?:[,.]\d+)?)/);

  if (rangeMatch) {
    const minValue = Number(rangeMatch[1].replace(',', '.'));
    const maxValue = Number(rangeMatch[2].replace(',', '.'));

    if (Number.isFinite(minValue) && Number.isFinite(maxValue)) {
      return (minValue + maxValue) / 2;
    }
  }

  const normalized = Number(value.replace(',', '.'));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function parseAllowedMealTypes(value: string | undefined): readonly MealType[] {
  if (!value) {
    return ['lunch', 'dinner'];
  }

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const allowsLunch = /\b(almuerzo|comida|lunch)\b/.test(normalized);
  const allowsDinner = /\b(cena|dinner)\b/.test(normalized);

  if (allowsLunch && allowsDinner) {
    return ['lunch', 'dinner'];
  }

  if (allowsLunch) {
    return ['lunch'];
  }

  if (allowsDinner) {
    return ['dinner'];
  }

  return ['lunch', 'dinner'];
}

function normalizeId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function readCachedCatalog(): Catalog | null {
  const rawCatalog = localStorage.getItem(CATALOG_CACHE_KEY);

  if (!rawCatalog) {
    return null;
  }

  try {
    return normalizeCatalog(JSON.parse(rawCatalog) as Catalog);
  } catch {
    localStorage.removeItem(CATALOG_CACHE_KEY);
    return null;
  }
}

function normalizeCatalog(catalog: Catalog): Catalog {
  return {
    recipes: catalog.recipes.map((recipe) => ({
      ...recipe,
      allowedMealTypes:
        recipe.allowedMealTypes && recipe.allowedMealTypes.length > 0
          ? recipe.allowedMealTypes
          : ['lunch', 'dinner'],
    })),
    ingredients: catalog.ingredients.map((ingredient) => ({
      ...ingredient,
      category: ingredient.category ?? '',
    })),
  };
}

interface GoogleSheetReference {
  readonly spreadsheetId: string;
  readonly gid: string;
}

interface SpreadsheetMetadataResponse {
  readonly sheets: readonly SpreadsheetSheet[];
}

interface SpreadsheetSheet {
  readonly properties: {
    readonly sheetId: number;
    readonly title: string;
  };
}

interface SheetValuesResponse {
  readonly values?: string[][];
}
