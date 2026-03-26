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
