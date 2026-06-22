import { describe, expect, it } from 'vitest';
import type { Catalog, WeeklyPlan } from '../types';
import {
  buildShoppingList,
  buildShoppingListNote,
  createEmptyPlan,
  deserializePlan,
  isRecipeAllowedForMeal,
  mergeLatestPlan,
  sanitizePlanForCatalog,
  serializePlan,
  setSlotRecipe,
} from './planner';

const catalog: Catalog = {
  recipes: [
    {
      id: 'r1',
      name: 'Pasta',
      category: 'Pasta',
      allowedMealTypes: ['lunch'],
      servings: 2,
    },
    {
      id: 'r2',
      name: 'Ensalada',
      category: 'Verdura',
      allowedMealTypes: ['dinner'],
      servings: 2,
    },
  ],
  ingredients: [
    {
      recipeId: 'r1',
      recipeName: 'Pasta',
      ingredientId: 'tomate',
      ingredientName: 'Tomate',
      category: 'Verdura',
      quantity: 200,
      unit: 'g',
    },
    {
      recipeId: 'r2',
      recipeName: 'Ensalada',
      ingredientId: 'tomate-alternativo',
      ingredientName: 'Tomate',
      category: 'Verdura',
      quantity: 150,
      unit: 'ud',
    },
    {
      recipeId: 'r2',
      recipeName: 'Ensalada',
      ingredientId: 'lechuga',
      ingredientName: 'Lechuga',
      category: '',
      quantity: 0,
      unit: '',
    },
    {
      recipeId: 'r2',
      recipeName: 'Ensalada',
      ingredientId: 'agua',
      ingredientName: 'Agua',
      category: 'Líquido',
      quantity: 200,
      unit: 'ml',
    },
  ],
};

describe('planner domain', () => {
  it('crea un plan semanal con comida y cena para siete dias', () => {
    const plan = createEmptyPlan('2026-06-15');

    expect(plan.slots).toHaveLength(14);
    expect(plan.slots[0]).toMatchObject({ date: '2026-06-15', mealType: 'lunch' });
    expect(plan.slots[13]).toMatchObject({ date: '2026-06-21', mealType: 'dinner' });
  });

  it('genera una lista de compra agrupada por ingrediente', () => {
    let plan = createEmptyPlan('2026-06-15');
    plan = setSlotRecipe(plan, '2026-06-15', 'lunch', 'r1');
    plan = setSlotRecipe(plan, '2026-06-16', 'dinner', 'r2');

    expect(buildShoppingList(plan, catalog)).toEqual([
      {
        ingredientId: 'lechuga',
        ingredientName: 'Lechuga',
        category: '',
        quantity: 0,
        unit: '',
        recipeNames: ['Ensalada'],
      },
      {
        ingredientId: 'tomate',
        ingredientName: 'Tomate',
        category: 'Verdura',
        quantity: 350,
        unit: 'g',
        recipeNames: ['Ensalada', 'Pasta'],
      },
    ]);
  });

  it('agrupa ingredientes por nombre aunque tengan IDs distintos', () => {
    let plan = createEmptyPlan('2026-06-15');
    plan = setSlotRecipe(plan, '2026-06-15', 'lunch', 'r1');
    plan = setSlotRecipe(plan, '2026-06-16', 'dinner', 'r2');

    const tomatoItems = buildShoppingList(plan, catalog).filter(
      (item) => item.ingredientName === 'Tomate',
    );

    expect(tomatoItems).toHaveLength(1);
    expect(tomatoItems[0]).toMatchObject({
      quantity: 350,
      unit: 'g',
    });
  });

  it('excluye agua de la lista de compra', () => {
    let plan = createEmptyPlan('2026-06-15');
    plan = setSlotRecipe(plan, '2026-06-16', 'dinner', 'r2');

    expect(buildShoppingList(plan, catalog).some((item) => item.ingredientName === 'Agua')).toBe(
      false,
    );
  });

  it('genera una nota de compra agrupada por tipo de ingrediente', () => {
    let plan = createEmptyPlan('2026-06-15');
    plan = setSlotRecipe(plan, '2026-06-15', 'lunch', 'r1');
    plan = setSlotRecipe(plan, '2026-06-16', 'dinner', 'r2');

    expect(buildShoppingListNote(buildShoppingList(plan, catalog), plan.weekStart)).toBe(
      [
        'Lista de la Compra',
        'Semana del 15/06/2026 al 21/06/2026',
        'Verdura\n- Tomate: 350 g',
        '- Lechuga: cantidad no especificada',
      ].join('\n\n'),
    );
  });

  it('serializa y deserializa planes', () => {
    const plan = createEmptyPlan('2026-06-15');

    expect(deserializePlan(serializePlan(plan))).toEqual(plan);
  });

  it('elige la version mas reciente por updatedAt', () => {
    const localPlan: WeeklyPlan = {
      ...createEmptyPlan('2026-06-15'),
      updatedAt: '2026-06-20T10:00:00.000Z',
    };
    const remotePlan: WeeklyPlan = { ...localPlan, updatedAt: '2026-06-20T11:00:00.000Z' };

    expect(mergeLatestPlan(localPlan, remotePlan)).toBe(remotePlan);
  });

  it('detecta si una receta esta permitida para una franja', () => {
    expect(isRecipeAllowedForMeal(catalog.recipes[0], 'lunch')).toBe(true);
    expect(isRecipeAllowedForMeal(catalog.recipes[0], 'dinner')).toBe(false);
  });

  it('elimina del plan recetas no permitidas para la franja', () => {
    let plan = createEmptyPlan('2026-06-15');
    plan = setSlotRecipe(plan, '2026-06-15', 'dinner', 'r1');
    plan = setSlotRecipe(plan, '2026-06-16', 'dinner', 'r2');

    const sanitizedPlan = sanitizePlanForCatalog(plan, catalog);

    expect(
      sanitizedPlan.slots.find((slot) => slot.date === '2026-06-15' && slot.mealType === 'dinner')
        ?.recipeId,
    ).toBeNull();
    expect(
      sanitizedPlan.slots.find((slot) => slot.date === '2026-06-16' && slot.mealType === 'dinner')
        ?.recipeId,
    ).toBe('r2');
  });
});
