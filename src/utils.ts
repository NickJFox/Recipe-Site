import { ImportDraft, Ingredient, Recipe, RecipeSection, RecipeSourceType } from "./types";

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function detectSourceType(url: string): RecipeSourceType {
  const value = url.toLowerCase();
  if (value.includes("instagram.com")) {
    return "instagram";
  }
  if (value.includes("tiktok.com")) {
    return "tiktok";
  }
  if (value.includes("youtube.com") || value.includes("youtu.be")) {
    return "youtube";
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return "website";
  }
  return "other";
}

export function guessTitleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/[-_]/g, " ")
      .trim();

    if (slug) {
      return slug
        .split(" ")
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(" ");
    }

    return parsed.hostname.replace("www.", "");
  } catch {
    return "Imported Recipe";
  }
}

export function createEmptyIngredient(): Ingredient {
  return {
    id: createId("ingredient"),
    name: "",
    quantity: "",
    unit: "",
    notes: "",
  };
}

export function createEmptyRecipeSection(title = ""): RecipeSection {
  return {
    id: createId("subrecipe"),
    title,
    ingredients: [createEmptyIngredient()],
    instructions: [""],
  };
}

export function createEmptyRecipe(sourceType: RecipeSourceType = "manual"): Recipe {
  return {
    id: createId("recipe"),
    title: "",
    description: "",
    categories: ["Dinner"],
    tags: [],
    imageUri: "",
    sourceType,
    sourceUrl: "",
    sourceLabel: "",
    ingredients: [createEmptyIngredient()],
    subRecipes: [],
    instructions: [""],
    servings: "",
    prepTime: "",
    favorite: false,
    createdAt: new Date().toISOString(),
  };
}

export function buildRecipeFromImport(draft: ImportDraft): Recipe {
  return {
    ...createEmptyRecipe(draft.sourceType),
    title: draft.titleGuess,
    sourceUrl: draft.url,
    sourceLabel: draft.url,
    description: draft.notes,
  };
}

export function cleanRecipe(recipe: Recipe): Recipe {
  return {
    ...recipe,
    title: recipe.title.trim(),
    description: recipe.description.trim(),
    categories: recipe.categories.filter(Boolean),
    imageUri: recipe.imageUri?.trim() ?? "",
    sourceUrl: recipe.sourceUrl?.trim() ?? "",
    sourceLabel: recipe.sourceLabel?.trim() ?? "",
    servings: recipe.servings.trim(),
    prepTime: recipe.prepTime.trim(),
    tags: recipe.tags.map((tag) => tag.trim()).filter(Boolean),
    ingredients: recipe.ingredients
      .map((ingredient) => ({
        ...ingredient,
        name: ingredient.name.trim(),
        quantity: ingredient.quantity.trim(),
        unit: ingredient.unit.trim(),
        notes: ingredient.notes.trim(),
      }))
      .filter((ingredient) => ingredient.name.length > 0),
    subRecipes: recipe.subRecipes
      .map((section) => ({
        ...section,
        title: section.title.trim(),
        ingredients: section.ingredients
          .map((ingredient) => ({
            ...ingredient,
            name: ingredient.name.trim(),
            quantity: ingredient.quantity.trim(),
            unit: ingredient.unit.trim(),
            notes: ingredient.notes.trim(),
          }))
          .filter((ingredient) => ingredient.name.length > 0),
        instructions: section.instructions.map((step) => step.trim()).filter(Boolean),
      }))
      .filter(
        (section) =>
          section.title.length > 0 || section.ingredients.length > 0 || section.instructions.length > 0
      ),
    instructions: recipe.instructions.map((step) => step.trim()).filter(Boolean),
  };
}

export function mergeGroceryItems(recipes: Recipe[]) {
  const map = new Map<string, { label: string; quantity: string; recipes: string[] }>();

  recipes.forEach((recipe) => {
    addIngredientsToMap(map, recipe.ingredients, recipe.title);
    recipe.subRecipes.forEach((section) => {
      const label = section.title ? `${recipe.title}: ${section.title}` : recipe.title;
      addIngredientsToMap(map, section.ingredients, label);
    });
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function getRecipeIngredientCount(recipe: Recipe) {
  return (
    recipe.ingredients.length +
    recipe.subRecipes.reduce((count, section) => count + section.ingredients.length, 0)
  );
}

function addIngredientsToMap(
  map: Map<string, { label: string; quantity: string; recipes: string[] }>,
  ingredients: Ingredient[],
  recipeTitle: string
) {
  ingredients.forEach((ingredient) => {
    const key = `${ingredient.name.toLowerCase()}::${ingredient.unit.toLowerCase()}`;
    const current = map.get(key);
    const quantityText = ingredient.quantity || "some";
    const nextLabel = ingredient.unit
      ? `${quantityText} ${ingredient.unit} ${ingredient.name}`.trim()
      : `${quantityText} ${ingredient.name}`.trim();

    if (!current) {
      map.set(key, {
        label: nextLabel,
        quantity: ingredient.quantity,
        recipes: [recipeTitle],
      });
      return;
    }

    const mergedQuantity = mergeQuantities(current.quantity, ingredient.quantity);
    current.quantity = mergedQuantity;
    current.label = ingredient.unit
      ? `${mergedQuantity || "some"} ${ingredient.unit} ${ingredient.name}`.trim()
      : `${mergedQuantity || "some"} ${ingredient.name}`.trim();
    current.recipes = [...new Set([...current.recipes, recipeTitle])];
  });
}

function mergeQuantities(first: string, second: string) {
  const firstNumber = Number(first);
  const secondNumber = Number(second);

  if (!Number.isNaN(firstNumber) && !Number.isNaN(secondNumber)) {
    return String(firstNumber + secondNumber);
  }

  if (first && second) {
    return `${first} + ${second}`;
  }

  return first || second;
}
