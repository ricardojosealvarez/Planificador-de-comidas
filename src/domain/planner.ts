import type { Catalog, MealSlot, MealType, Recipe, ShoppingListItem, WeeklyPlan } from '../types';
import { addDays } from './dates';

export const MEAL_TYPES: readonly MealType[] = ['lunch', 'dinner'];

export const MEAL_LABELS: Record<MealType, string> = {
  lunch: 'Comida',
  dinner: 'Cena',
};

export function createEmptyPlan(weekStart: string): WeeklyPlan {
  return {
    id: `week-${weekStart}`,
    weekStart,
    slots: Array.from({ length: 7 }).flatMap((_, dayIndex) =>
      MEAL_TYPES.map<MealSlot>((mealType) => ({
        date: addDays(weekStart, dayIndex),
        mealType,
        recipeId: null,
      })),
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function setSlotRecipe(
  plan: WeeklyPlan,
  date: string,
  mealType: MealType,
  recipeId: string | null,
): WeeklyPlan {
  return {
    ...plan,
    slots: plan.slots.map((slot) =>
      slot.date === date && slot.mealType === mealType ? { ...slot, recipeId } : slot,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function isRecipeAllowedForMeal(recipe: Recipe, mealType: MealType): boolean {
  if (!recipe.allowedMealTypes || recipe.allowedMealTypes.length === 0) {
    return true;
  }

  return recipe.allowedMealTypes.includes(mealType);
}

export function sanitizePlanForCatalog(plan: WeeklyPlan, catalog: Catalog): WeeklyPlan {
  const recipeById = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));
  let changed = false;

  const slots = plan.slots.map((slot) => {
    if (!slot.recipeId) {
      return slot;
    }

    const recipe = recipeById.get(slot.recipeId);

    if (recipe && isRecipeAllowedForMeal(recipe, slot.mealType)) {
      return slot;
    }

    changed = true;
    return { ...slot, recipeId: null };
  });

  return changed ? { ...plan, slots, updatedAt: new Date().toISOString() } : plan;
}

export function serializePlan(plan: WeeklyPlan): string {
  return JSON.stringify(plan);
}

export function deserializePlan(rawPlan: string): WeeklyPlan {
  const parsedPlan = JSON.parse(rawPlan) as WeeklyPlan;

  if (!parsedPlan.weekStart || !Array.isArray(parsedPlan.slots)) {
    throw new Error('Plan semanal inválido');
  }

  return parsedPlan;
}

export function mergeLatestPlan(localPlan: WeeklyPlan, remotePlan: WeeklyPlan | null): WeeklyPlan {
  if (!remotePlan) {
    return localPlan;
  }

  return new Date(remotePlan.updatedAt).getTime() > new Date(localPlan.updatedAt).getTime()
    ? remotePlan
    : localPlan;
}

export function buildShoppingList(plan: WeeklyPlan, catalog: Catalog): ShoppingListItem[] {
  const recipeById = new Map(catalog.recipes.map((recipe) => [recipe.id, recipe]));
  const selectedRecipes = plan.slots
    .map((slot) => (slot.recipeId ? recipeById.get(slot.recipeId) : undefined))
    .filter((recipe): recipe is Recipe => Boolean(recipe));

  const selectedRecipeIds = new Set(selectedRecipes.map((recipe) => recipe.id));
  const selectedRecipeNameById = new Map(selectedRecipes.map((recipe) => [recipe.id, recipe.name]));
  const groupedItems = new Map<string, ShoppingListItem>();

  for (const ingredient of catalog.ingredients) {
    if (!selectedRecipeIds.has(ingredient.recipeId)) {
      continue;
    }

    const key = normalizeShoppingIngredientName(ingredient.ingredientName);

    if (key === 'agua') {
      continue;
    }

    const currentItem = groupedItems.get(key);
    const recipeName = selectedRecipeNameById.get(ingredient.recipeId) ?? ingredient.recipeName;
    const unit = currentItem?.unit || ingredient.unit;

    groupedItems.set(key, {
      ingredientId: currentItem?.ingredientId ?? ingredient.ingredientId,
      ingredientName: currentItem?.ingredientName ?? ingredient.ingredientName,
      category: currentItem?.category || ingredient.category,
      quantity: (currentItem?.quantity ?? 0) + ingredient.quantity,
      unit,
      recipeNames: Array.from(new Set([...(currentItem?.recipeNames ?? []), recipeName])).sort(),
    });
  }

  return Array.from(groupedItems.values()).sort((first, second) =>
    first.ingredientName.localeCompare(second.ingredientName, 'es'),
  );
}

export function buildShoppingListNote(
  items: readonly ShoppingListItem[],
  weekStart?: string,
): string {
  const header = ['Lista de la Compra', weekStart ? formatWeekLabel(weekStart) : null].filter(
    (line): line is string => Boolean(line),
  );

  if (items.length === 0) {
    return [...header, 'No hay ingredientes planificados.'].join('\n\n');
  }

  const itemsByCategory = items.reduce<Map<string, ShoppingListItem[]>>((groups, item) => {
    const category = item.category.trim();

    if (!category) {
      return groups;
    }

    groups.set(category, [...(groups.get(category) ?? []), item]);
    return groups;
  }, new Map());
  const categoryBlocks = Array.from(itemsByCategory.entries())
    .sort(([firstCategory], [secondCategory]) => firstCategory.localeCompare(secondCategory, 'es'))
    .map(([category, categoryItems]) => {
      const lines = categoryItems
        .slice()
        .sort((first, second) => first.ingredientName.localeCompare(second.ingredientName, 'es'))
        .map((item) => `- ${item.ingredientName}: ${formatShoppingQuantity(item)}`);

      return [category, ...lines].join('\n');
    });

  const uncategorizedLines = items
    .filter((item) => !item.category.trim())
    .sort((first, second) => first.ingredientName.localeCompare(second.ingredientName, 'es'))
    .map((item) => `- ${item.ingredientName}: ${formatShoppingQuantity(item)}`);

  return [...header, ...categoryBlocks, ...uncategorizedLines].join('\n\n');
}

function formatWeekLabel(weekStart: string): string {
  return `Semana del ${formatShortDate(weekStart)} al ${formatShortDate(addDays(weekStart, 6))}`;
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split('-');

  return `${day}/${month}/${year}`;
}

function formatShoppingQuantity(item: ShoppingListItem): string {
  if (!item.unit.trim()) {
    return 'cantidad no especificada';
  }

  const quantity = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(
    item.quantity,
  );

  return `${quantity} ${item.unit}`;
}

function normalizeShoppingIngredientName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(cebollas|zanahorias|puerros)\b/g, (match) => match.slice(0, -1));
}
