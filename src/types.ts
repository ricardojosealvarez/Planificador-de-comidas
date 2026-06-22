export type MealType = 'lunch' | 'dinner';

export interface Recipe {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly allowedMealTypes: readonly MealType[];
  readonly servings: number;
  readonly notes?: string;
}

export interface RecipeIngredient {
  readonly recipeId: string;
  readonly recipeName: string;
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly category: string;
  readonly quantity: number;
  readonly unit: string;
}

export type FoodGroup =
  | 'legumes'
  | 'fish'
  | 'whiteMeat'
  | 'eggs'
  | 'redMeat'
  | 'ultraProcessed'
  | 'vegetables'
  | 'cereals'
  | 'dairy'
  | 'nuts';

export interface MealSlot {
  readonly date: string;
  readonly mealType: MealType;
  readonly recipeId: string | null;
}

export interface WeeklyPlan {
  readonly id: string;
  readonly weekStart: string;
  readonly slots: readonly MealSlot[];
  readonly updatedAt: string;
}

export interface ShoppingListItem {
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly category: string;
  readonly quantity: number;
  readonly unit: string;
  readonly recipeNames: readonly string[];
}

export interface Catalog {
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly RecipeIngredient[];
}

export interface AppConfig {
  readonly recipesCsvUrl: string;
  readonly ingredientsCsvUrl: string;
  readonly googleClientId: string;
  readonly googleApiKey: string;
}
