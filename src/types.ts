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

export type Recipe = {
  id: string;
  title: string;
  description: string;
  category: RecipeCategory;
  tags: string[];
  sourceType: RecipeSourceType;
  sourceUrl?: string;
  sourceLabel?: string;
  ingredients: Ingredient[];
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

export type AppData = {
  recipes: Recipe[];
  importDrafts: ImportDraft[];
};
