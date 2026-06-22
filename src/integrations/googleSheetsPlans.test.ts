import { describe, expect, it, vi } from 'vitest';
import { createEmptyPlan, setSlotRecipe } from '../domain/planner';
import { createGoogleSheetsPlanClient } from './googleSheetsPlans';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

describe('createGoogleSheetsPlanClient', () => {
  it('crea un spreadsheet personal con hojas META y PLANES', async () => {
    const fetchMock: FetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ spreadsheetId: 'sheet-1', spreadsheetUrl: 'https://sheet' }),
      )
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const store = await createGoogleSheetsPlanClient('api-key').createPlanStore('token');

    expect(store).toEqual({ spreadsheetId: 'sheet-1', spreadsheetUrl: 'https://sheet' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readRequestBody(fetchMock, 0)).toContain('"META"');
    expect(readRequestBody(fetchMock, 0)).toContain('"PLANES"');
  });

  it('carga un plan remoto desde la hoja PLANES', async () => {
    const plan = setSlotRecipe(createEmptyPlan('2026-06-15'), '2026-06-15', 'lunch', 'r1');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        jsonResponse({
          values: [
            ['weekStart', 'updatedAt', 'planJson', 'schemaVersion'],
            ['2026-06-15', plan.updatedAt, JSON.stringify(plan), '1'],
          ],
        }),
      ),
    );

    const loadedPlan = await createGoogleSheetsPlanClient('api-key').loadPlan(
      'token',
      'sheet-1',
      '2026-06-15',
    );

    expect(loadedPlan).toEqual(plan);
  });

  it('guarda un plan existente actualizando la fila correspondiente', async () => {
    const plan = createEmptyPlan('2026-06-15');
    const fetchMock: FetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ values: [['weekStart'], ['2026-06-15']] }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await createGoogleSheetsPlanClient('api-key').savePlan('token', 'sheet-1', plan);

    expect(fetchMock.mock.calls[1]?.[0]).toContain('PLANES!A2%3AD2');
    expect(readRequestInit(fetchMock, 1).method).toBe('PUT');
  });
});

function readRequestBody(fetchMock: FetchMock, callIndex: number): BodyInit | null | undefined {
  return readRequestInit(fetchMock, callIndex).body;
}

function readRequestInit(fetchMock: FetchMock, callIndex: number): RequestInit {
  return fetchMock.mock.calls[callIndex]?.[1] ?? {};
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
