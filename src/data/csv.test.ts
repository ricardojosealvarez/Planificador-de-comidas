import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parsea cabeceras, comillas y saltos de linea', () => {
    const rows = parseCsv('Nombre,Notas\n"Lentejas, verduras","Rica\nsin carne"');

    expect(rows).toEqual([
      {
        nombre: 'Lentejas, verduras',
        notas: 'Rica\nsin carne',
      },
    ]);
  });

  it('ignora filas vacias', () => {
    const rows = parseCsv('id,nombre\n1,Arroz\n,');

    expect(rows).toEqual([{ id: '1', nombre: 'Arroz' }]);
  });

  it('normaliza cabeceras con acentos y simbolos', () => {
    const rows = parseCsv('ID receta,Plato normalizado,Nº apariciones\nREC_001,Lentejas,3');

    expect(rows).toEqual([
      {
        id_receta: 'REC_001',
        plato_normalizado: 'Lentejas',
        n_apariciones: '3',
      },
    ]);
  });
});
