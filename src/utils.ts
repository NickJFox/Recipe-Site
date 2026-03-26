import { ImportDraft, Ingredient, Recipe, RecipeSourceType } from "./types";

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

export function createEmptyRecipe(sourceType: RecipeSourceType = "manual"): Recipe {
  return {
    id: createId("recipe"),
    title: "",
    description: "",
    category: "Dinner",
    tags: [],
    sourceType,
    sourceUrl: "",
    sourceLabel: "",
    ingredients: [createEmptyIngredient()],
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
    instructions: recipe.instructions.map((step) => step.trim()).filter(Boolean),
  };
}

export function mergeGroceryItems(recipes: Recipe[]) {
  const map = new Map<string, { label: string; quantity: string; recipes: string[] }>();

  recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
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
          recipes: [recipe.title],
        });
        return;
      }

      const mergedQuantity = mergeQuantities(current.quantity, ingredient.quantity);
      current.quantity = mergedQuantity;
      current.label = ingredient.unit
        ? `${mergedQuantity || "some"} ${ingredient.unit} ${ingredient.name}`.trim()
        : `${mergedQuantity || "some"} ${ingredient.name}`.trim();
      current.recipes = [...new Set([...current.recipes, recipe.title])];
    });
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
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
