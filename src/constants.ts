import { RecipeCategory } from "./types";

export const CATEGORY_OPTIONS: RecipeCategory[] = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Dessert",
  "Snack",
  "Drink",
  "Meal Prep",
];

export const SOURCE_LABELS = {
  manual: "Manual Entry",
  website: "Website Link",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  other: "Other",
} as const;

export const PREP_TIME_OPTIONS = [
  "5 min",
  "10 min",
  "15 min",
  "20 min",
  "30 min",
  "45 min",
  "1 hour",
  "90 min",
  "2 hours",
] as const;

export const SERVING_OPTIONS = ["1", "2", "4", "6", "8", "10", "12"] as const;

export const QUANTITY_OPTIONS = [
  "0.25",
  "0.5",
  "0.75",
  "1",
  "1.5",
  "2",
  "3",
  "4",
  "5",
  "6",
  "8",
  "10",
  "12",
  "16",
] as const;

export const TAG_OPTIONS = [
  "quick",
  "family favorite",
  "vegetarian",
  "high protein",
  "meal prep",
  "freezer-friendly",
  "gluten-free",
  "spicy",
  "holiday",
] as const;

export const UNIT_OPTIONS = [
  "",
  "tsp",
  "tbsp",
  "cup",
  "oz",
  "lb",
  "g",
  "kg",
  "ml",
  "l",
  "clove",
  "cloves",
  "can",
  "jar",
  "package",
  "carton",
  "slice",
  "bunch",
  "dozen",
  "pinch",
] as const;
