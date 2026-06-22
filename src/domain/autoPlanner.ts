import type { Catalog, FoodGroup, MealType, Recipe, WeeklyPlan } from '../types';
import { addDays } from './dates';
import { classifyRecipe, createFoodGroupCounts, type FoodGroupCounts } from './foodGroups';
import { isRecipeAllowedForMeal, MEAL_TYPES, setSlotRecipe } from './planner';

const WEEKLY_TARGETS: Partial<Record<FoodGroup, { min: number; max?: number }>> = {
  legumes: { min: 2, max: 4 },
  fish: { min: 3, max: 4 },
  whiteMeat: { min: 3, max: 4 },
  eggs: { min: 3, max: 4 },
  redMeat: { min: 0, max: 1 },
  ultraProcessed: { min: 0, max: 0 },
};

const TARGET_GROUPS = Object.keys(WEEKLY_TARGETS) as readonly FoodGroup[];
const SCORE_WEIGHT_OFFSET = 50;

interface CandidateRecord {
  readonly recipe: Recipe;
  readonly groups: ReadonlySet<FoodGroup>;
}

export function generateRandomWeeklyPlan(plan: WeeklyPlan, catalog: Catalog): WeeklyPlan {
  const recipeGroupsById = new Map(
    catalog.recipes.map((recipe) => [recipe.id, classifyRecipe(recipe, catalog)]),
  );
  const groupCounts = createFoodGroupCounts();
  const selectedRecipeIds = new Set<string>();
  let nextPlan = plan;

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = addDays(plan.weekStart, dayIndex);

    for (const mealType of MEAL_TYPES) {
      const recipe = pickRecipe(
        catalog.recipes,
        mealType,
        recipeGroupsById,
        groupCounts,
        selectedRecipeIds,
      );

      if (recipe) {
        nextPlan = setSlotRecipe(nextPlan, date, mealType, recipe.id);
        selectedRecipeIds.add(recipe.id);
        incrementGroupCounts(groupCounts, recipeGroupsById.get(recipe.id) ?? new Set<FoodGroup>());
      }
    }
  }

  return nextPlan;
}

function pickRecipe(
  recipes: readonly Recipe[],
  mealType: MealType,
  recipeGroupsById: ReadonlyMap<string, ReadonlySet<FoodGroup>>,
  groupCounts: FoodGroupCounts,
  selectedRecipeIds: ReadonlySet<string>,
): Recipe | null {
  const candidates = recipes.filter((recipe) => isRecipeAllowedForMeal(recipe, mealType));

  if (candidates.length === 0) {
    return null;
  }

  const records = candidates.map<CandidateRecord>((recipe) => ({
    recipe,
    groups: recipeGroupsById.get(recipe.id) ?? new Set<FoodGroup>(),
  }));
  const maxAwareRecords = preferRecords(
    records,
    (record) => !hasReachedWeeklyMax(record.groups, groupCounts),
  );
  const repeatAwareRecords = preferRecords(
    maxAwareRecords,
    (record) => !selectedRecipeIds.has(record.recipe.id),
  );
  const targetRecords = pickPendingTargetRecords(repeatAwareRecords, groupCounts);
  const finalRecords = targetRecords.length > 0 ? targetRecords : repeatAwareRecords;

  return pickWeightedRecipe(finalRecords, groupCounts, selectedRecipeIds);
}

function preferRecords(
  records: readonly CandidateRecord[],
  predicate: (record: CandidateRecord) => boolean,
): readonly CandidateRecord[] {
  const preferredRecords = records.filter(predicate);
  return preferredRecords.length > 0 ? preferredRecords : records;
}

function pickPendingTargetRecords(
  records: readonly CandidateRecord[],
  groupCounts: FoodGroupCounts,
): readonly CandidateRecord[] {
  const pendingGroups = TARGET_GROUPS.filter((group) => {
    const target = WEEKLY_TARGETS[group];
    return Boolean(target && groupCounts[group] < target.min && hasRecordWithGroup(records, group));
  });
  const selectedGroup = randomItem(pendingGroups);

  return selectedGroup ? records.filter((record) => record.groups.has(selectedGroup)) : [];
}

function pickWeightedRecipe(
  records: readonly CandidateRecord[],
  groupCounts: FoodGroupCounts,
  selectedRecipeIds: ReadonlySet<string>,
): Recipe | null {
  const weightedRecords = records.map((record) => ({
    record,
    weight: Math.max(
      1,
      scoreRecipe(record.recipe, record.groups, groupCounts, selectedRecipeIds) +
        SCORE_WEIGHT_OFFSET,
    ),
  }));
  const totalWeight = weightedRecords.reduce((total, item) => total + item.weight, 0);
  let marker = Math.random() * totalWeight;

  for (const item of weightedRecords) {
    marker -= item.weight;

    if (marker <= 0) {
      return item.record.recipe;
    }
  }

  return weightedRecords.at(-1)?.record.recipe ?? null;
}

function randomItem<T>(items: readonly T[]): T | null {
  if (items.length === 0) {
    return null;
  }

  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function hasRecordWithGroup(records: readonly CandidateRecord[], group: FoodGroup): boolean {
  return records.some((record) => record.groups.has(group));
}

function hasReachedWeeklyMax(
  groups: ReadonlySet<FoodGroup>,
  groupCounts: FoodGroupCounts,
): boolean {
  return Array.from(groups).some((group) => {
    const target = WEEKLY_TARGETS[group];
    return target?.max !== undefined && groupCounts[group] >= target.max;
  });
}

function scoreRecipe(
  recipe: Recipe,
  groups: ReadonlySet<FoodGroup>,
  groupCounts: FoodGroupCounts,
  selectedRecipeIds: ReadonlySet<string>,
): number {
  let score = selectedRecipeIds.has(recipe.id) ? -25 : 0;
  const hasPendingTarget = hasAnyPendingTarget(groupCounts);
  const coversPendingTarget = Array.from(groups).some((group) => {
    const target = WEEKLY_TARGETS[group];
    return target ? groupCounts[group] < target.min : false;
  });

  if (hasPendingTarget && !coversPendingTarget) {
    score -= 12;
  }

  for (const group of groups) {
    const target = WEEKLY_TARGETS[group];

    if (!target) {
      continue;
    }

    if (groupCounts[group] < target.min) {
      score += 18 + (target.min - groupCounts[group]) * 2;
      continue;
    }

    if (target.max !== undefined && groupCounts[group] >= target.max) {
      score -= group === 'redMeat' || group === 'ultraProcessed' ? 40 : 14;
      continue;
    }

    score -= 2;
  }

  if (groups.size === 0) {
    score += 1;
  }

  return score;
}

function hasAnyPendingTarget(groupCounts: FoodGroupCounts): boolean {
  return Object.entries(WEEKLY_TARGETS).some(([group, target]) => {
    return groupCounts[group as FoodGroup] < target.min;
  });
}

function incrementGroupCounts(groupCounts: FoodGroupCounts, groups: ReadonlySet<FoodGroup>) {
  for (const group of groups) {
    groupCounts[group] += 1;
  }
}
