import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog, Recipe } from '../types';
import { generateRandomWeeklyPlan } from './autoPlanner';
import { createEmptyPlan } from './planner';

const recipes: readonly Recipe[] = [
  {
    id: 'legume-lunch',
    name: 'Lentejas con verduras',
    category: 'Legumbre',
    allowedMealTypes: ['lunch'],
    servings: 1,
  },
  {
    id: 'fish-lunch',
    name: 'Salmón con arroz',
    category: 'Pescado',
    allowedMealTypes: ['lunch'],
    servings: 1,
  },
  {
    id: 'chicken-lunch',
    name: 'Pollo con quinoa',
    category: 'Plancha',
    allowedMealTypes: ['lunch'],
    servings: 1,
  },
  {
    id: 'egg-dinner',
    name: 'Tortilla de verduras',
    category: 'Huevos',
    allowedMealTypes: ['dinner'],
    servings: 1,
  },
  {
    id: 'fish-dinner',
    name: 'Merluza al horno',
    category: 'Pescado',
    allowedMealTypes: ['dinner'],
    servings: 1,
  },
  {
    id: 'chicken-dinner',
    name: 'Pavo salteado',
    category: 'Plancha',
    allowedMealTypes: ['dinner'],
    servings: 1,
  },
];

const catalog: Catalog = {
  recipes,
  ingredients: [],
};

describe('generateRandomWeeklyPlan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rellena toda la semana respetando las franjas permitidas', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const plan = generateRandomWeeklyPlan(createEmptyPlan('2026-06-15'), catalog);

    expect(plan.slots.every((slot) => slot.recipeId)).toBe(true);
    expect(plan.slots).toHaveLength(14);

    for (const slot of plan.slots) {
      const recipe = recipes.find((candidate) => candidate.id === slot.recipeId);
      expect(recipe?.allowedMealTypes).toContain(slot.mealType);
    }
  });

  it('varía la primera comida al generar semanas con distinta aleatoriedad', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const firstPlan = generateRandomWeeklyPlan(createEmptyPlan('2026-06-15'), catalog);

    randomSpy.mockReturnValue(0.99);
    const secondPlan = generateRandomWeeklyPlan(createEmptyPlan('2026-06-15'), catalog);

    expect(firstPlan.slots[0]?.recipeId).not.toBe(secondPlan.slots[0]?.recipeId);
  });
});
