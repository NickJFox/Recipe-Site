export type RecipeCategory =
  | "Breakfast"
  | "Lunch"
  | "Dinner"
  | "Dessert"
  | "Snack"
  | "Drink"
  | "Meal Prep";

export type RecipeSourceType =
  | "manual"
  | "website"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "other";

export type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  notes: string;
};

export type RecipeSection = {
  id: string;
  title: string;
  ingredients: Ingredient[];
  instructions: string[];
};

export type Recipe = {
  id: string;
  title: string;
  description: string;
  categories: RecipeCategory[];
  tags: string[];
  imageUri?: string;
  sourceType: RecipeSourceType;
  sourceUrl?: string;
  sourceLabel?: string;
  ingredients: Ingredient[];
  subRecipes: RecipeSection[];
  instructions: string[];
  servings: string;
  prepTime: string;
  favorite: boolean;
  createdAt: string;
};

export type ImportDraft = {
  id: string;
  url: string;
  sourceType: RecipeSourceType;
  titleGuess: string;
  notes: string;
  createdAt: string;
};

export type MealPlanDay =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type MealPlanEntry = {
  day: MealPlanDay;
  recipeId: string | null;
};

export type AppData = {
  recipes: Recipe[];
  importDrafts: ImportDraft[];
  mealPlan: MealPlanEntry[];
};
