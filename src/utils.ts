import { ImportDraft, Ingredient, Recipe, RecipeSection, RecipeSourceType } from "./types";

export type GroceryListItem = {
  key: string;
  label: string;
  quantity: string;
  recipes: string[];
};

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
    quantity: "1",
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

export async function buildRecipeFromUrl(url: string): Promise<Recipe> {
  const trimmedUrl = url.trim();
  const fallbackRecipe = {
    ...createEmptyRecipe(detectSourceType(trimmedUrl)),
    title: guessTitleFromUrl(trimmedUrl),
    sourceUrl: trimmedUrl,
    sourceLabel: getSourceLabel(trimmedUrl),
  };

  const response = await fetch(trimmedUrl);
  if (!response.ok) {
    throw new Error(`Could not load the page (${response.status}).`);
  }

  const html = await response.text();
  const parsed = parseRecipePage(html);

  return {
    ...fallbackRecipe,
    title: parsed.title || fallbackRecipe.title,
    description: parsed.description || fallbackRecipe.description,
    imageUri: parsed.imageUri || fallbackRecipe.imageUri,
    ingredients: parsed.ingredients.length > 0 ? parsed.ingredients : fallbackRecipe.ingredients,
    instructions: parsed.instructions.length > 0 ? parsed.instructions : fallbackRecipe.instructions,
    servings: parsed.servings || fallbackRecipe.servings,
    prepTime: parsed.prepTime || fallbackRecipe.prepTime,
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

function parseRecipePage(html: string) {
  const recipe = parseJsonLdRecipes(html)[0];

  return {
    title: getJsonText(recipe?.name) || getMetaContent(html, "og:title") || getTitleTag(html),
    description:
      getJsonText(recipe?.description) ||
      getMetaContent(html, "og:description") ||
      getMetaContent(html, "description"),
    imageUri: getJsonImage(recipe?.image) || getMetaContent(html, "og:image"),
    ingredients: getJsonArray(recipe?.recipeIngredient).map(parseIngredientLine),
    instructions: parseRecipeInstructions(recipe?.recipeInstructions),
    servings: getJsonText(recipe?.recipeYield),
    prepTime: formatDuration(getJsonText(recipe?.prepTime) || getJsonText(recipe?.totalTime)),
  };
}

function parseJsonLdRecipes(html: string): Array<Record<string, unknown>> {
  const scriptBlocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];

  return scriptBlocks.flatMap((block) => {
    try {
      return findRecipeObjects(JSON.parse(stripHtmlComments(block[1])));
    } catch {
      return [];
    }
  });
}

function findRecipeObjects(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(findRecipeObjects);
  }

  const object = value as Record<string, unknown>;
  const type = object["@type"];
  const types = Array.isArray(type) ? type : [type];
  const isRecipe = types.some((item) => typeof item === "string" && item.toLowerCase() === "recipe");
  const graphRecipes = Array.isArray(object["@graph"]) ? object["@graph"].flatMap(findRecipeObjects) : [];

  return isRecipe ? [object, ...graphRecipes] : graphRecipes;
}

function parseIngredientLine(line: string): Ingredient {
  const value = decodeHtml(line).trim();
  const match = value.match(/^(\d+(?:[./]\d+)?|\d+\s+\d+\/\d+)?\s*([a-zA-Z]+)?\s+(.+)$/);

  if (!match) {
    return { ...createEmptyIngredient(), quantity: "", name: value };
  }

  const [, quantity = "", possibleUnit = "", rest = value] = match;
  const unit = normalizeImportedUnit(possibleUnit);

  if (unit) {
    return { ...createEmptyIngredient(), quantity, unit, name: rest };
  }

  return {
    ...createEmptyIngredient(),
    quantity,
    name: [possibleUnit, rest].filter(Boolean).join(" "),
  };
}

function normalizeImportedUnit(value: string) {
  const unit = value.toLowerCase();
  const unitMap: Record<string, string> = {
    teaspoon: "tsp",
    teaspoons: "tsp",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    cups: "cup",
    ounces: "oz",
    ounce: "oz",
    pounds: "lb",
    pound: "lb",
    lbs: "lb",
    grams: "g",
    gram: "g",
    kilograms: "kg",
    kilogram: "kg",
    liters: "l",
    liter: "l",
    cloves: "cloves",
    cans: "can",
    jars: "jar",
    packages: "package",
    slices: "slice",
    bunches: "bunch",
    pinches: "pinch",
  };
  const knownUnits = new Set([
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
    "slice",
    "bunch",
    "pinch",
  ]);

  return unitMap[unit] ?? (knownUnits.has(unit) ? unit : "");
}

function parseRecipeInstructions(value: unknown): string[] {
  if (typeof value === "string") {
    return [decodeHtml(value).trim()].filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((step) => {
      if (typeof step === "string") {
        return step;
      }

      if (!step || typeof step !== "object") {
        return "";
      }

      const object = step as Record<string, unknown>;
      if (Array.isArray(object.itemListElement)) {
        return parseRecipeInstructions(object.itemListElement);
      }

      return getJsonText(object.text) || getJsonText(object.name);
    })
    .map((step) => decodeHtml(step).trim())
    .filter(Boolean);
}

function getJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(getJsonText).filter(Boolean);
  }

  const text = getJsonText(value);
  return text ? [text] : [];
}

function getJsonText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return decodeHtml(String(value)).trim();
  }

  if (Array.isArray(value)) {
    return value.map(getJsonText).filter(Boolean).join(", ");
  }

  return "";
}

function getJsonImage(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return getJsonImage(value[0]);
  }

  if (value && typeof value === "object") {
    const image = value as Record<string, unknown>;
    return getJsonText(image.url) || getJsonText(image.contentUrl);
  }

  return "";
}

function getMetaContent(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapedName}["'][^>]*>`, "i"),
  ];
  const match = patterns.map((pattern) => html.match(pattern)).find(Boolean);

  return match?.[1] ? decodeHtml(match[1]).trim() : "";
}

function getTitleTag(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]).trim() : "";
}

function formatDuration(value: string) {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!match) {
    return value;
  }

  const [, hours, minutes] = match;
  return [hours ? `${hours} hour${hours === "1" ? "" : "s"}` : "", minutes ? `${minutes} min` : ""]
    .filter(Boolean)
    .join(" ");
}

function getSourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function stripHtmlComments(value: string) {
  return value.replace(/<!--|-->/g, "").trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function mergeGroceryItems(recipes: Recipe[]) {
  const map = new Map<string, GroceryListItem>();

  recipes.forEach((recipe) => {
    addIngredientsToMap(map, recipe.ingredients, recipe.title);
    recipe.subRecipes.forEach((section) => {
      const label = section.title ? `${recipe.title}: ${section.title}` : recipe.title;
      addIngredientsToMap(map, section.ingredients, label);
    });
  });

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function mergeIngredientCollections(collections: Array<{ label: string; ingredients: Ingredient[] }>) {
  const map = new Map<string, GroceryListItem>();

  collections.forEach((collection) => {
    addIngredientsToMap(map, collection.ingredients, collection.label);
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
  map: Map<string, GroceryListItem>,
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
        key,
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
