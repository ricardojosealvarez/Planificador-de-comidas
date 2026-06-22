import { describe, expect, it, vi } from 'vitest';
import { loadCatalog } from './catalog';

describe('loadCatalog', () => {
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

    const catalog = await loadCatalog(
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

function textResponse(body: string): Response {
  return new Response(body, { status: 200 });
}
