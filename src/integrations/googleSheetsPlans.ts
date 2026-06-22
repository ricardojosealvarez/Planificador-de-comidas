import type { WeeklyPlan } from '../types';
import { deserializePlan, serializePlan } from '../domain/planner';

const GOOGLE_API_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';
const GOOGLE_DRIVE_API_BASE_URL = 'https://www.googleapis.com/drive/v3/files';
const META_RANGE = 'META!A1:B10';
const PLANS_RANGE = 'PLANES!A1:D';

export interface PlanStoreMeta {
  readonly spreadsheetId: string;
  readonly spreadsheetUrl: string;
}

export interface GoogleSheetsPlanClient {
  readonly findPlanStore: (accessToken: string) => Promise<PlanStoreMeta | null>;
  readonly createPlanStore: (accessToken: string) => Promise<PlanStoreMeta>;
  readonly loadPlan: (
    accessToken: string,
    spreadsheetId: string,
    weekStart: string,
  ) => Promise<WeeklyPlan | null>;
  readonly savePlan: (
    accessToken: string,
    spreadsheetId: string,
    plan: WeeklyPlan,
  ) => Promise<void>;
}

export function createGoogleSheetsPlanClient(apiKey: string): GoogleSheetsPlanClient {
  return {
    findPlanStore: (accessToken) => findPlanStore(accessToken),
    createPlanStore: (accessToken) => createPlanStore(accessToken, apiKey),
    loadPlan: (accessToken, spreadsheetId, weekStart) =>
      loadPlan(accessToken, spreadsheetId, weekStart, apiKey),
    savePlan: (accessToken, spreadsheetId, plan) => savePlan(accessToken, spreadsheetId, plan),
  };
}

async function findPlanStore(accessToken: string): Promise<PlanStoreMeta | null> {
  const query = encodeURIComponent(
    "name = 'Planificador de comidas - Planes' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
  );
  const response = await googleFetch<DriveFilesResponse>(
    `${GOOGLE_DRIVE_API_BASE_URL}?q=${query}&fields=files(id,name,webViewLink)&pageSize=1`,
    accessToken,
  );
  const file = response.files[0];

  if (!file) {
    return null;
  }

  return {
    spreadsheetId: file.id,
    spreadsheetUrl: file.webViewLink,
  };
}

async function createPlanStore(accessToken: string, apiKey: string): Promise<PlanStoreMeta> {
  const response = await googleFetch<CreateSpreadsheetResponse>(
    `${GOOGLE_API_BASE_URL}?key=${encodeURIComponent(apiKey)}`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: 'Planificador de comidas - Planes' },
        sheets: [{ properties: { title: 'META' } }, { properties: { title: 'PLANES' } }],
      }),
    },
  );

  await writeValues(accessToken, response.spreadsheetId, META_RANGE, [
    ['clave', 'valor'],
    ['app', 'planificador-comidas'],
    ['version', '1'],
    ['createdAt', new Date().toISOString()],
  ]);

  await writeValues(accessToken, response.spreadsheetId, PLANS_RANGE, [
    ['weekStart', 'updatedAt', 'planJson', 'schemaVersion'],
  ]);

  return {
    spreadsheetId: response.spreadsheetId,
    spreadsheetUrl: response.spreadsheetUrl,
  };
}

async function loadPlan(
  accessToken: string,
  spreadsheetId: string,
  weekStart: string,
  apiKey: string,
): Promise<WeeklyPlan | null> {
  const range = encodeURIComponent(PLANS_RANGE);
  const response = await googleFetch<SheetValuesResponse>(
    `${GOOGLE_API_BASE_URL}/${spreadsheetId}/values/${range}?key=${encodeURIComponent(apiKey)}`,
    accessToken,
  );

  const row = response.values?.slice(1).find((values) => values[0] === weekStart);
  const rawPlan = row?.[2];

  return rawPlan ? deserializePlan(rawPlan) : null;
}

async function savePlan(
  accessToken: string,
  spreadsheetId: string,
  plan: WeeklyPlan,
): Promise<void> {
  const rows = await readRows(accessToken, spreadsheetId);
  const rowIndex = rows.findIndex((row) => row[0] === plan.weekStart);
  const values = [[plan.weekStart, plan.updatedAt, serializePlan(plan), '1']];

  if (rowIndex >= 0) {
    await writeValues(
      accessToken,
      spreadsheetId,
      `PLANES!A${rowIndex + 2}:D${rowIndex + 2}`,
      values,
    );
    return;
  }

  await appendValues(accessToken, spreadsheetId, 'PLANES!A:D', values);
}

async function readRows(accessToken: string, spreadsheetId: string): Promise<string[][]> {
  const response = await googleFetch<SheetValuesResponse>(
    `${GOOGLE_API_BASE_URL}/${spreadsheetId}/values/${encodeURIComponent(PLANS_RANGE)}`,
    accessToken,
  );

  return response.values?.slice(1) ?? [];
}

async function writeValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: readonly (readonly string[])[],
): Promise<void> {
  await googleFetch<SheetValuesResponse>(
    `${GOOGLE_API_BASE_URL}/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values }),
    },
  );
}

async function appendValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: readonly (readonly string[])[],
): Promise<void> {
  await googleFetch<SheetValuesResponse>(
    `${GOOGLE_API_BASE_URL}/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ values }),
    },
  );
}

async function googleFetch<TResponse>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<TResponse> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Google API error ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as TResponse;
}

interface DriveFilesResponse {
  readonly files: readonly DriveFile[];
}

interface DriveFile {
  readonly id: string;
  readonly webViewLink: string;
}

interface CreateSpreadsheetResponse {
  readonly spreadsheetId: string;
  readonly spreadsheetUrl: string;
}

interface SheetValuesResponse {
  readonly values?: string[][];
}
