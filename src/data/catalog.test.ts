import { describe, expect, it, vi } from 'vitest';
import { loadGoogleSheetsCatalog, loadPublicCatalog } from './catalog';

describe('loadPublicCatalog', () => {
  it('mapea las cabeceras reales del Google Sheet maestro', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          textResponse(
            'ID receta,Plato normalizado,Tipo,Nº apariciones,Variantes origen,Necesita revisión,Motivo revisión,Observaciones,Momento comida\nREC_001,Lentejas estofadas,Legumbre,1,,,,,Almuerzo',
          ),
        )
        .mockResolvedValueOnce(
          textResponse(
            'ID ingrediente,ID receta,Plato normalizado,Ingrediente,Categoría,Cantidad indicada,Unidad,Origen ingrediente,Confianza,Notas\nING_0001,REC_001,Lentejas estofadas,Lentejas,Legumbre,125-150,g,Literal,Alta,',
          ),
        ),
    );

    const catalog = await loadPublicCatalog(
      'https://example.com/recetas.csv',
      'https://example.com/ingredientes.csv',
    );

    expect(catalog.recipes[0]).toMatchObject({
      id: 'REC_001',
      name: 'Lentejas estofadas',
      category: 'Legumbre',
      allowedMealTypes: ['lunch'],
    });
    expect(catalog.ingredients[0]).toMatchObject({
      ingredientId: 'ING_0001',
      recipeId: 'REC_001',
      ingredientName: 'Lentejas',
      category: 'Legumbre',
      quantity: 137.5,
      unit: 'g',
    });
  });
});

describe('loadGoogleSheetsCatalog', () => {
  it('carga el catálogo desde pestañas privadas de Google Sheets', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          sheets: [
            { properties: { sheetId: 2030871257, title: 'RECETAS' } },
            { properties: { sheetId: 1180992792, title: 'INGREDIENTES' } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [
              'ID receta',
              'Plato normalizado',
              'Tipo',
              'Nº apariciones',
              'Variantes origen',
              'Necesita revisión',
              'Motivo revisión',
              'Observaciones',
              'Momento comida',
            ],
            ['REC_001', 'Lentejas estofadas', 'Legumbre', '1', '', '', '', '', 'Almuerzo'],
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          values: [
            [
              'ID ingrediente',
              'ID receta',
              'Plato normalizado',
              'Ingrediente',
              'Categoría',
              'Cantidad indicada',
              'Unidad',
              'Origen ingrediente',
              'Confianza',
              'Notas',
            ],
            [
              'ING_0001',
              'REC_001',
              'Lentejas estofadas',
              'Lentejas',
              'Legumbre',
              '125-150',
              'g',
              'Literal',
              'Alta',
              '',
            ],
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await loadGoogleSheetsCatalog(
      'token',
      'api-key',
      'https://docs.google.com/spreadsheets/d/sheet-1/export?format=csv&gid=2030871257',
      'https://docs.google.com/spreadsheets/d/sheet-1/export?format=csv&gid=1180992792',
    );

    expect(catalog.recipes[0]).toMatchObject({
      id: 'REC_001',
      name: 'Lentejas estofadas',
      allowedMealTypes: ['lunch'],
    });
    expect(catalog.ingredients[0]).toMatchObject({
      ingredientId: 'ING_0001',
      quantity: 137.5,
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer token',
    });
  });
});

function textResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
