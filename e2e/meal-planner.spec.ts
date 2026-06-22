import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://docs.google.com/spreadsheets/d/**/export**', async (route) => {
    const url = route.request().url();

    if (url.includes('gid=2030871257')) {
      await route.fulfill({
        contentType: 'text/csv',
        body: [
          'ID receta,Plato normalizado,Tipo,Nº apariciones,Variantes origen,Necesita revisión,Motivo revisión,Observaciones,Momento comida',
          'r1,Lentejas con verduras,Guiso,1,,,,,Almuerzo',
          'r2,Ensalada de garbanzos,Ensalada,1,,,,,Cena',
          'r3,Merluza al horno,Pescado,1,,,,,Cena',
          'r4,Pollo con arroz,Plancha,1,,,,,Almuerzo',
        ].join('\n'),
      });
      return;
    }

    await route.fulfill({
      contentType: 'text/csv',
      body: [
        'ID ingrediente,ID receta,Plato normalizado,Ingrediente,Categoría,Cantidad indicada,Unidad,Origen ingrediente,Confianza,Notas',
        'i1,r1,Lentejas con verduras,Lentejas,Legumbre,320,g,Literal,Alta,',
        'i2,r2,Ensalada de garbanzos,Lentejas,Legumbre,180,ud,Literal,Alta,',
        'i3,r3,Merluza al horno,Merluza,Pescado,200,g,Literal,Alta,',
        'i4,r4,Pollo con arroz,Pollo,Carne blanca,200,g,Literal,Alta,',
      ].join('\n'),
    });
  });

  await page.route('https://accounts.google.com/gsi/client', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.google = {
          accounts: {
            oauth2: {
              initTokenClient: (config) => ({
                requestAccessToken: () => config.callback({ access_token: 'e2e-token' })
              })
            }
          }
        };
      `,
    });
  });

  await page.route('https://www.googleapis.com/drive/v3/files**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ files: [] }),
    });
  });

  await page.route('https://sheets.googleapis.com/v4/spreadsheets**', async (route) => {
    const request = route.request();

    if (request.method() === 'POST' && request.url().includes(':append')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }

    if (request.method() === 'POST') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          spreadsheetId: 'sheet-1',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1',
        }),
      });
      return;
    }

    if (request.method() === 'PUT') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ values: [['weekStart', 'updatedAt', 'planJson', 'schemaVersion']] }),
    });
  });
});

test('planifica una comida, conecta Google y guarda el plan', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Planificador de comidas' })).toBeVisible();
  await expect(page.getByText('4 recetas')).toBeVisible();
  await page
    .getByRole('button', { name: 'Lentejas con verduras Guiso · 1 raciones · Almuerzo' })
    .click();
  await page.getByLabel('Comida 2026-06-15', { exact: true }).selectOption('r1');

  await expect(page.getByText('Lentejas', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Conectar Google' }).click();
  await expect(page.getByText('Google Drive conectado')).toBeVisible();

  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Plan guardado en Google Sheets')).toBeVisible();
});

test('rellena la semana completa automaticamente respetando almuerzo y cena', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Planificador de comidas' })).toBeVisible();
  await expect(page.getByText('4 recetas')).toBeVisible();

  await page.getByRole('button', { name: 'Rellenar semana' }).click();

  await expect(
    page.getByText('Semana rellenada aleatoriamente con recomendaciones de consumo'),
  ).toBeVisible();
  await expect(page.getByText('Lentejas', { exact: true })).toBeVisible();
  await expect(page.getByText('Merluza', { exact: true })).toBeVisible();
});

test('advierte antes de borrar la planificacion visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Planificador de comidas' })).toBeVisible();
  await expect(page.getByText('4 recetas')).toBeVisible();

  await page.getByRole('button', { name: 'Rellenar semana' }).click();
  await expect(page.getByText('Lentejas', { exact: true })).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Se borrará toda la planificación visible');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Borrar pantalla' }).click();

  await expect(page.getByText('Planificación en pantalla borrada')).toBeVisible();
  await expect(page.getByText('Lentejas', { exact: true })).toHaveCount(0);
});

test('abre Google Keep con la lista de la compra resumida', async ({ page }) => {
  await page.addInitScript(() => {
    window.open = (url) => {
      window.localStorage.setItem('keep-url', String(url));
      return null;
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem('keep-text', text);
        },
      },
    });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Planificador de comidas' })).toBeVisible();
  await expect(page.getByText('4 recetas')).toBeVisible();
  await page.getByLabel('Comida 2026-06-15', { exact: true }).selectOption('r1');
  await page.getByLabel('Cena 2026-06-15', { exact: true }).selectOption('r2');
  await page.getByRole('button', { name: 'Lista de la Compra' }).click();

  await expect(page.getByText('Lista de la compra copiada y Google Keep abierto')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('keep-url')))
    .toContain('https://keep.google.com/#create');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('keep-text')))
    .toContain('Semana del 15/06/2026 al 21/06/2026');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('keep-text')))
    .toContain('Legumbre\n- Lentejas: 500 g');
});
