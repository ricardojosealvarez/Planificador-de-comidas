import type { Catalog, FoodGroup, Recipe } from '../types';

export type FoodGroupCounts = Record<FoodGroup, number>;

const FOOD_GROUPS: readonly FoodGroup[] = [
  'legumes',
  'fish',
  'whiteMeat',
  'eggs',
  'redMeat',
  'ultraProcessed',
  'vegetables',
  'cereals',
  'dairy',
  'nuts',
];

const GROUP_PATTERNS: Record<FoodGroup, readonly RegExp[]> = {
  legumes: [/\b(legumbre|garbanzo|lenteja|alubia|judia|habichuela|hummus)\b/],
  fish: [/\b(pescado|salmon|atun|merluza|melva|sardina|bacalao|chipiron|calamar|marisco|gamba)\b/],
  whiteMeat: [/\b(pollo|pavo|conejo)\b/],
  eggs: [/\b(huevo|tortilla)\b/],
  redMeat: [/\b(ternera|buey|cerdo|cordero|hamburguesa)\b/],
  ultraProcessed: [/\b(embutido|chorizo|salchicha|bacon|beicon|bolleria|refresco)\b/],
  vegetables: [
    /\b(verdura|hortaliza|tomate|lechuga|calabacin|zanahoria|pepino|pimiento|cebolla|berenjena)\b/,
  ],
  cereals: [/\b(cereal|arroz|pasta|pan|quinoa|cuscus|avena)\b/],
  dairy: [/\b(lacteo|yogur|kefir|queso|leche)\b/],
  nuts: [/\b(fruto seco|nuez|almendra|avellana|anacardo|pistacho)\b/],
};

export function createFoodGroupCounts(): FoodGroupCounts {
  return FOOD_GROUPS.reduce<FoodGroupCounts>((counts, group) => {
    counts[group] = 0;
    return counts;
  }, {} as FoodGroupCounts);
}

export function classifyRecipe(recipe: Recipe, catalog: Catalog): Set<FoodGroup> {
  const ingredientsText = catalog.ingredients
    .filter((ingredient) => ingredient.recipeId === recipe.id)
    .map((ingredient) => `${ingredient.ingredientName} ${ingredient.unit}`)
    .join(' ');
  const haystack = normalizeText(`${recipe.name} ${recipe.category} ${ingredientsText}`);
  const groups = new Set<FoodGroup>();

  for (const group of FOOD_GROUPS) {
    if (GROUP_PATTERNS[group].some((pattern) => pattern.test(haystack))) {
      groups.add(group);
    }
  }

  return groups;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
