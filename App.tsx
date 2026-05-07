import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CATEGORY_OPTIONS,
  PREP_TIME_OPTIONS,
  SERVING_OPTIONS,
  SOURCE_LABELS,
  UNIT_OPTIONS,
} from "./src/constants";
import { sampleData } from "./src/sampleData";
import { loadAppData, saveAppData } from "./src/storage";
import { AppData, ImportDraft, Ingredient, MealPlanDay, Recipe, RecipeCategory, RecipeSection } from "./src/types";
import {
  cleanRecipe,
  createEmptyIngredient,
  createEmptyRecipe,
  createEmptyRecipeSection,
  detectSourceType,
  getRecipeIngredientCount,
  mergeIngredientCollections,
} from "./src/utils";

type Screen =
  | { name: "home" }
  | { name: "recipe-form"; draft: Recipe; importDraftId?: string }
  | { name: "recipe-detail"; recipeId: string }
  | { name: "imports" }
  | { name: "grocery" };

const TABS: Array<{ key: "home" | "recipe-form" | "imports" | "grocery"; label: string }> = [
  { key: "home", label: "Recipes" },
  { key: "imports", label: "Meal Plan" },
  { key: "grocery", label: "Groceries" },
];

const WEEK_DAYS: MealPlanDay[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function createEmptyMealPlan() {
  return WEEK_DAYS.map((day) => ({ day, recipeId: null }));
}

function normalizeAppData(appData: AppData | { recipes: Recipe[]; importDrafts: ImportDraft[] }) {
  const mealPlanSource = "mealPlan" in appData && Array.isArray(appData.mealPlan) ? appData.mealPlan : [];
  const groceryEssentials =
    "groceryEssentials" in appData && Array.isArray(appData.groceryEssentials)
      ? appData.groceryEssentials
      : [];
  const checkedGroceryItemKeys =
    "checkedGroceryItemKeys" in appData && Array.isArray(appData.checkedGroceryItemKeys)
      ? appData.checkedGroceryItemKeys
      : [];

  return {
    recipes: appData.recipes.map(normalizeRecipe),
    importDrafts: appData.importDrafts ?? [],
    mealPlan: WEEK_DAYS.map((day) => ({
      day,
      recipeId: mealPlanSource.find((entry) => entry.day === day)?.recipeId ?? null,
    })),
    groceryEssentials: groceryEssentials.map((ingredient) => ({
      ...ingredient,
      id: ingredient.id ?? createEmptyIngredient().id,
      name: ingredient.name ?? "",
      quantity: ingredient.quantity ?? "",
      unit: ingredient.unit ?? "",
      notes: ingredient.notes ?? "",
    })),
    checkedGroceryItemKeys: checkedGroceryItemKeys.filter((key): key is string => typeof key === "string"),
  } satisfies AppData;
}

function normalizeRecipe(recipe: Recipe): Recipe {
  const legacyCategory = (recipe as Recipe & { category?: RecipeCategory }).category;

  return {
    ...recipe,
    categories:
      recipe.categories?.length
        ? recipe.categories
        : legacyCategory
          ? [legacyCategory]
          : ["Dinner"],
    imageUri: recipe.imageUri ?? "",
    ingredients: recipe.ingredients?.length ? recipe.ingredients : [createEmptyIngredient()],
    subRecipes: (recipe.subRecipes ?? []).map((section) => ({
      ...section,
      ingredients: section.ingredients?.length ? section.ingredients : [createEmptyIngredient()],
      instructions: section.instructions?.length ? section.instructions : [""],
    })),
    instructions: recipe.instructions?.length ? recipe.instructions : [""],
  };
}

function hasRecipeContent(recipe: Recipe) {
  const subRecipes = recipe.subRecipes ?? [];
  const ingredientCount = recipe.ingredients.length + subRecipes.reduce((sum, section) => sum + section.ingredients.length, 0);
  const instructionCount = recipe.instructions.length + subRecipes.reduce((sum, section) => sum + section.instructions.length, 0);
  return ingredientCount > 0 && instructionCount > 0;
}

function formatIngredientLine(ingredient: Ingredient) {
  return `${ingredient.quantity ? `${ingredient.quantity} ` : ""}${ingredient.unit ? `${ingredient.unit} ` : ""}${
    ingredient.name
  }${ingredient.notes ? ` (${ingredient.notes})` : ""}`.trim();
}

export default function App() {
  const [data, setData] = useState<AppData>(normalizeAppData(sampleData));
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | "All">("All");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [expandedMealPlanDay, setExpandedMealPlanDay] = useState<MealPlanDay | null>(null);
  const [includeMealPlanGroceries, setIncludeMealPlanGroceries] = useState(true);
  const [includeManualRecipeGroceries, setIncludeManualRecipeGroceries] = useState(false);
  const [includeEssentialGroceries, setIncludeEssentialGroceries] = useState(true);
  const [manageEssentials, setManageEssentials] = useState(false);
  const [groceryDraft, setGroceryDraft] = useState<Ingredient>(createEmptyIngredient());
  const [expandedGroceryUnit, setExpandedGroceryUnit] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      const stored = await loadAppData();
      if (stored) {
        setData(normalizeAppData(stored));
      }
      setLoading(false);
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    void saveAppData(data);
  }, [data, loading]);

  const filteredRecipes = useMemo(() => {
    return data.recipes.filter((recipe) =>
      selectedCategory === "All" ? true : recipe.categories.includes(selectedCategory)
    );
  }, [data.recipes, selectedCategory]);

  const plannedRecipesForGroceries = useMemo(
    () =>
      data.mealPlan
        .map((entry) => ({
          day: entry.day,
          recipe: data.recipes.find((recipe) => recipe.id === entry.recipeId) ?? null,
        }))
        .filter((entry): entry is { day: MealPlanDay; recipe: Recipe } => Boolean(entry.recipe)),
    [data.mealPlan, data.recipes]
  );

  const groceryItems = useMemo(() => {
    const collections: Array<{ label: string; ingredients: Ingredient[] }> = [];

    if (includeMealPlanGroceries) {
      plannedRecipesForGroceries.forEach(({ day, recipe }) => {
        collections.push({ label: `${day}: ${recipe.title}`, ingredients: recipe.ingredients });
        recipe.subRecipes.forEach((section) => {
          collections.push({
            label: section.title ? `${day}: ${recipe.title} - ${section.title}` : `${day}: ${recipe.title}`,
            ingredients: section.ingredients,
          });
        });
      });
    }

    if (includeManualRecipeGroceries) {
      const manualRecipes = data.recipes.filter((recipe) => selectedRecipeIds.includes(recipe.id));
      manualRecipes.forEach((recipe) => {
        collections.push({ label: recipe.title, ingredients: recipe.ingredients });
        recipe.subRecipes.forEach((section) => {
          collections.push({
            label: section.title ? `${recipe.title} - ${section.title}` : recipe.title,
            ingredients: section.ingredients,
          });
        });
      });
    }

    if (includeEssentialGroceries) {
      collections.push({ label: "Essentials", ingredients: data.groceryEssentials });
    }

    return mergeIngredientCollections(collections);
  }, [
    data.groceryEssentials,
    data.recipes,
    includeEssentialGroceries,
    includeManualRecipeGroceries,
    includeMealPlanGroceries,
    plannedRecipesForGroceries,
    selectedRecipeIds,
  ]);

  function openNewRecipeForm() {
    setScreen({ name: "recipe-form", draft: createEmptyRecipe("manual") });
  }

  function goToTopLevelScreen(name: "home" | "imports" | "grocery") {
    if (name === "home") {
      setScreen({ name: "home" });
      return;
    }

    if (name === "imports") {
      setScreen({ name: "imports" });
      return;
    }

    setScreen({ name: "grocery" });
  }

  function handleSaveRecipe(recipe: Recipe, importDraftId?: string) {
    const cleaned = cleanRecipe(recipe);
    if (!cleaned.title || !hasRecipeContent(cleaned)) {
      return;
    }

    setData((current) => {
      const exists = current.recipes.some((item) => item.id === cleaned.id);
      return {
        ...current,
        recipes: exists
          ? current.recipes.map((item) => (item.id === cleaned.id ? cleaned : item))
          : [cleaned, ...current.recipes],
        importDrafts: importDraftId
          ? current.importDrafts.filter((draft) => draft.id !== importDraftId)
          : current.importDrafts,
      };
    });
    setScreen({ name: "recipe-detail", recipeId: cleaned.id });
  }

  function handleDeleteRecipe(recipeId: string) {
    setData((current) => ({
      ...current,
      recipes: current.recipes.filter((recipe) => recipe.id !== recipeId),
      mealPlan: current.mealPlan.map((entry) => ({
        ...entry,
        recipeId: entry.recipeId === recipeId ? null : entry.recipeId,
      })),
    }));
    setSelectedRecipeIds((current) => current.filter((id) => id !== recipeId));
    setScreen({ name: "home" });
  }

  function toggleFavorite(recipeId: string) {
    setData((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, favorite: !recipe.favorite } : recipe
      ),
    }));
  }

  function toggleRecipeSelection(recipeId: string) {
    setSelectedRecipeIds((current) =>
      current.includes(recipeId) ? current.filter((id) => id !== recipeId) : [...current, recipeId]
    );
  }

  function addGroceryEssential() {
    if (!groceryDraft.name.trim()) {
      return;
    }

    setData((current) => ({
      ...current,
      groceryEssentials: [
        ...current.groceryEssentials,
        {
          ...groceryDraft,
          name: groceryDraft.name.trim(),
          quantity: groceryDraft.quantity.trim(),
          unit: groceryDraft.unit.trim(),
          notes: groceryDraft.notes.trim(),
        },
      ],
    }));
    setGroceryDraft(createEmptyIngredient());
    setExpandedGroceryUnit(false);
  }

  function removeGroceryEssential(ingredientId: string) {
    setData((current) => ({
      ...current,
      groceryEssentials: current.groceryEssentials.filter((ingredient) => ingredient.id !== ingredientId),
    }));
  }

  function toggleCheckedGroceryItem(itemKey: string) {
    setData((current) => ({
      ...current,
      checkedGroceryItemKeys: current.checkedGroceryItemKeys.includes(itemKey)
        ? current.checkedGroceryItemKeys.filter((key) => key !== itemKey)
        : [...current.checkedGroceryItemKeys, itemKey],
    }));
  }

  function clearCheckedGroceries() {
    setData((current) => ({
      ...current,
      checkedGroceryItemKeys: [],
    }));
  }

  function assignMealPlanRecipe(day: MealPlanDay, recipeId: string | null) {
    setData((current) => ({
      ...current,
      mealPlan: current.mealPlan.map((entry) => (entry.day === day ? { ...entry, recipeId } : entry)),
    }));
    setExpandedMealPlanDay(null);
  }

  function autoFillMealPlan() {
    if (data.recipes.length === 0) {
      return;
    }

    const recipePool = [...data.recipes].sort((first, second) => {
      if (first.favorite !== second.favorite) {
        return first.favorite ? -1 : 1;
      }

      return first.title.localeCompare(second.title);
    });

    setData((current) => ({
      ...current,
      mealPlan: current.mealPlan.map((entry, index) => ({
        ...entry,
        recipeId: recipePool[index % recipePool.length]?.id ?? null,
      })),
    }));
    setExpandedMealPlanDay(null);
  }

  function clearMealPlan() {
    setData((current) => ({
      ...current,
      mealPlan: createEmptyMealPlan(),
    }));
    setExpandedMealPlanDay(null);
  }

  const plannedRecipes = useMemo(
    () =>
      data.mealPlan.map((entry) => ({
        ...entry,
        recipe: data.recipes.find((recipe) => recipe.id === entry.recipeId) ?? null,
      })),
    [data.mealPlan, data.recipes]
  );

  const activeRecipe =
    screen.name === "recipe-detail"
      ? data.recipes.find((recipe) => recipe.id === screen.recipeId)
      : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Recipe Book</Text>
          <Text style={styles.title}>Recipes you love while making meal planning and grocery shopping easier.</Text>
          <Text style={styles.subtitle}>
            Save recipes by category, build meal plans, and create grocery list from multiple meals.
          </Text>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() =>
                tab.key === "recipe-form" ? openNewRecipeForm() : goToTopLevelScreen(tab.key)
              }
              style={[
                styles.tab,
                (screen.name === tab.key || (tab.key === "recipe-form" && screen.name === "recipe-form")) &&
                  styles.tabActive,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  (screen.name === tab.key || (tab.key === "recipe-form" && screen.name === "recipe-form")) &&
                    styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {screen.name === "home" && (
            <View style={styles.screenBlock}>
              <SectionHeading
                title="Recipe Library"
                detail={`${data.recipes.length} saved recipes`}
                actionLabel="Add Recipe"
                onAction={openNewRecipeForm}
              />

              <View style={styles.categoryFilterGrid}>
                <FilterChip
                  label="All"
                  active={selectedCategory === "All"}
                  onPress={() => setSelectedCategory("All")}
                />
                {CATEGORY_OPTIONS.map((category) => (
                  <FilterChip
                    key={category}
                    label={category}
                    active={selectedCategory === category}
                    onPress={() => setSelectedCategory(category)}
                  />
                ))}
              </View>

              <View style={styles.cardGrid}>
                {filteredRecipes.map((recipe) => (
                  <Pressable
                    key={recipe.id}
                    style={styles.recipeCard}
                    onPress={() => setScreen({ name: "recipe-detail", recipeId: recipe.id })}
                  >
                    <View style={styles.recipeCardHeader}>
                      <Text style={styles.recipeCategory}>{recipe.categories.join(" • ")}</Text>
                    </View>
                    {recipe.imageUri ? <Image source={{ uri: recipe.imageUri }} style={styles.recipeCardImage} /> : null}
                    <Text style={styles.recipeTitle}>{recipe.title}</Text>
                    <Text style={styles.recipeDescription}>{recipe.description || "No description yet."}</Text>
                    <View style={styles.metaRow}>
                      <MetaPill label={`${getRecipeIngredientCount(recipe)} ingredients`} />
                      {recipe.subRecipes.length > 0 ? <MetaPill label={`${recipe.subRecipes.length} sub-recipes`} /> : null}
                      <MetaPill label={SOURCE_LABELS[recipe.sourceType]} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {screen.name === "recipe-form" && (
            <RecipeForm
              key={screen.draft.id}
              draft={normalizeRecipe(screen.draft)}
              importDraftId={screen.importDraftId}
              onCancel={() => setScreen({ name: "home" })}
              onSave={handleSaveRecipe}
            />
          )}

          {screen.name === "recipe-detail" && activeRecipe && (
            <RecipeDetail
              recipe={activeRecipe}
              onBack={() => setScreen({ name: "home" })}
              onEdit={() => setScreen({ name: "recipe-form", draft: activeRecipe })}
              onDelete={() => handleDeleteRecipe(activeRecipe.id)}
            />
          )}

          {screen.name === "imports" && (
            <View style={styles.screenBlock}>
              <SectionHeading title="Weekly Meal Plan" detail="Build your week from recipes already in your library" />
              <View style={styles.heroCard}>
                <Text style={styles.cardTitle}>Plan the week</Text>
                <Text style={styles.supportingText}>
                  Pick a recipe for each day or let the app fill the calendar automatically using
                  recipes you have already saved.
                </Text>
                <View style={styles.inlineButtonRow}>
                  <Pressable style={styles.primaryButton} onPress={autoFillMealPlan}>
                    <Text style={styles.primaryButtonLabel}>Auto-fill week</Text>
                  </Pressable>
                  <Pressable style={styles.ghostButton} onPress={clearMealPlan}>
                    <Text style={styles.ghostButtonLabel}>Clear plan</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.cardGrid}>
                {plannedRecipes.map((entry) => (
                  <View key={entry.day} style={styles.mealPlanCard}>
                    <View style={styles.mealPlanHeader}>
                      <Text style={styles.recipeCategory}>{entry.day}</Text>
                      <Pressable
                        style={styles.mealPlanAction}
                        onPress={() =>
                          setExpandedMealPlanDay((current) => (current === entry.day ? null : entry.day))
                        }
                      >
                        <Text style={styles.mealPlanActionLabel}>
                          {expandedMealPlanDay === entry.day ? "Hide" : "Choose"}
                        </Text>
                      </Pressable>
                    </View>

                    {entry.recipe ? (
                      <>
                        <Text style={styles.recipeTitle}>{entry.recipe.title}</Text>
                        <Text style={styles.recipeDescription}>
                          {entry.recipe.description || entry.recipe.categories.join(" • ")}
                        </Text>
                        <View style={styles.metaRow}>
                          <MetaPill label={entry.recipe.categories.join(" • ")} />
                          {entry.recipe.prepTime ? <MetaPill label={entry.recipe.prepTime} /> : null}
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={styles.recipeTitle}>No recipe planned</Text>
                        <Text style={styles.supportingText}>
                          Choose a saved recipe for {entry.day.toLowerCase()} or auto-fill the week.
                        </Text>
                      </>
                    )}

                    {expandedMealPlanDay === entry.day ? (
                      <View style={styles.mealPlanPicker}>
                        <Pressable style={styles.ghostButton} onPress={() => assignMealPlanRecipe(entry.day, null)}>
                          <Text style={styles.ghostButtonLabel}>Clear day</Text>
                        </Pressable>
                        {data.recipes.map((recipe) => {
                          const selected = recipe.id === entry.recipeId;
                          return (
                            <Pressable
                              key={`${entry.day}-${recipe.id}`}
                              style={[styles.mealPlanOption, selected && styles.mealPlanOptionActive]}
                              onPress={() => assignMealPlanRecipe(entry.day, recipe.id)}
                            >
                              <Text
                                style={[
                                  styles.mealPlanOptionTitle,
                                  selected && styles.mealPlanOptionTitleActive,
                                ]}
                              >
                                {recipe.title}
                              </Text>
                              <Text
                                style={[
                                  styles.mealPlanOptionDetail,
                                  selected && styles.mealPlanOptionDetailActive,
                                ]}
                              >
                                {recipe.categories.join(" • ")}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          )}

          {screen.name === "grocery" && (
            <View style={styles.screenBlock}>
              <SectionHeading title="Grocery List" detail="Build one list from meal plans, recipes, and essentials" />
              <View style={styles.heroCard}>
                <Text style={styles.cardTitle}>List sources</Text>
                <Text style={styles.supportingText}>
                  Turn on the sources you want to include in this shopping run.
                </Text>
                <View style={styles.selectionRow}>
                  <View style={styles.selectionContent}>
                    <Text style={styles.selectionTitle}>Meal plan</Text>
                    <Text style={styles.selectionDetail}>
                      Pull from {plannedRecipesForGroceries.length} planned day
                      {plannedRecipesForGroceries.length === 1 ? "" : "s"}.
                    </Text>
                  </View>
                  <Switch
                    value={includeMealPlanGroceries}
                    onValueChange={setIncludeMealPlanGroceries}
                    trackColor={{ false: "#d9dee8", true: "#14b8a6" }}
                    thumbColor="#ffffff"
                  />
                </View>
                {includeMealPlanGroceries && plannedRecipesForGroceries.length > 0 ? (
                  <View style={styles.sourcePreviewBlock}>
                    {plannedRecipesForGroceries.map(({ day, recipe }) => (
                      <View key={`${day}-${recipe.id}`} style={styles.sourcePreviewRow}>
                        <Text style={styles.sourcePreviewTitle}>{day}</Text>
                        <Text style={styles.sourcePreviewDetail}>{recipe.title}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.selectionRow}>
                  <View style={styles.selectionContent}>
                    <Text style={styles.selectionTitle}>Manual recipe picks</Text>
                    <Text style={styles.selectionDetail}>
                      Select recipes outside the weekly meal plan.
                    </Text>
                  </View>
                  <Switch
                    value={includeManualRecipeGroceries}
                    onValueChange={setIncludeManualRecipeGroceries}
                    trackColor={{ false: "#d9dee8", true: "#14b8a6" }}
                    thumbColor="#ffffff"
                  />
                </View>
                {includeManualRecipeGroceries ? (
                  <View style={styles.sourcePreviewBlock}>
                    {data.recipes.map((recipe) => (
                      <View key={recipe.id} style={styles.selectionRow}>
                        <Pressable style={styles.selectionContent} onPress={() => toggleRecipeSelection(recipe.id)}>
                          <Text style={styles.selectionTitle}>{recipe.title}</Text>
                          <Text style={styles.selectionDetail}>{recipe.categories.join(" • ")}</Text>
                        </Pressable>
                        <Switch
                          value={selectedRecipeIds.includes(recipe.id)}
                          onValueChange={() => toggleRecipeSelection(recipe.id)}
                          trackColor={{ false: "#d9dee8", true: "#14b8a6" }}
                          thumbColor="#ffffff"
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.selectionRow}>
                  <View style={styles.selectionContent}>
                    <Text style={styles.selectionTitle}>Essentials</Text>
                    <Text style={styles.selectionDetail}>
                      Always-available staples like milk, eggs, fruit, and pantry basics.
                    </Text>
                  </View>
                  <Switch
                    value={includeEssentialGroceries}
                    onValueChange={setIncludeEssentialGroceries}
                    trackColor={{ false: "#d9dee8", true: "#14b8a6" }}
                    thumbColor="#ffffff"
                  />
                </View>
                <View style={styles.inlineButtonRow}>
                  <Pressable
                    style={styles.ghostButton}
                    onPress={() => setManageEssentials((current) => !current)}
                  >
                    <Text style={styles.ghostButtonLabel}>
                      {manageEssentials ? "Done managing essentials" : "Manage essentials"}
                    </Text>
                  </Pressable>
                </View>
                {includeEssentialGroceries && data.groceryEssentials.length > 0 ? (
                  <View style={styles.sourcePreviewBlock}>
                    {data.groceryEssentials.map((ingredient) => (
                      <View key={ingredient.id} style={styles.essentialRow}>
                        <View style={styles.selectionContent}>
                          <Text style={styles.selectionTitle}>{formatIngredientLine(ingredient)}</Text>
                          {ingredient.notes ? (
                            <Text style={styles.selectionDetail}>{ingredient.notes}</Text>
                          ) : null}
                        </View>
                        <Pressable style={styles.ghostButton} onPress={() => removeGroceryEssential(ingredient.id)}>
                          <Text style={styles.ghostButtonLabel}>Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
                {manageEssentials ? (
                  <View style={styles.manageEssentialsCard}>
                    <Text style={styles.cardTitle}>Add essential item</Text>
                    <Text style={styles.supportingText}>
                      Save common groceries here so they can be added to future shopping lists with one switch.
                    </Text>
                    <View style={styles.ingredientRow}>
                      <View style={styles.quantityFieldWrap}>
                        <QuantityField
                          label="Qty"
                          value={groceryDraft.quantity}
                          placeholder="1"
                          onChange={(value) => setGroceryDraft((current) => ({ ...current, quantity: value }))}
                        />
                      </View>
                      <View style={styles.unitSelectWrap}>
                        <SelectField
                          label="Unit"
                          value={groceryDraft.unit}
                          placeholder="Unit"
                          options={UNIT_OPTIONS}
                          expanded={expandedGroceryUnit}
                          onToggle={() => setExpandedGroceryUnit((current) => !current)}
                          onSelect={(value) => {
                            setGroceryDraft((current) => ({ ...current, unit: value }));
                            setExpandedGroceryUnit(false);
                          }}
                        />
                      </View>
                    </View>
                    <TextInput
                      value={groceryDraft.name}
                      onChangeText={(value) => setGroceryDraft((current) => ({ ...current, name: value }))}
                      placeholder="Essential item name"
                      placeholderTextColor="#7c8798"
                      style={styles.input}
                    />
                    <TextInput
                      value={groceryDraft.notes}
                      onChangeText={(value) => setGroceryDraft((current) => ({ ...current, notes: value }))}
                      placeholder="Optional note"
                      placeholderTextColor="#7c8798"
                      style={styles.input}
                    />
                    <Pressable style={styles.secondaryButton} onPress={addGroceryEssential}>
                      <Text style={styles.secondaryButtonLabel}>Add essential</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.heroCard}>
                <View style={styles.sectionHeading}>
                  <View>
                    <Text style={styles.cardTitle}>Combined shopping list</Text>
                    <Text style={styles.sectionDetail}>Check items off while you shop.</Text>
                  </View>
                  <Pressable style={styles.ghostButton} onPress={clearCheckedGroceries}>
                    <Text style={styles.ghostButtonLabel}>Reset checks</Text>
                  </Pressable>
                </View>
                {groceryItems.length === 0 ? (
                  <Text style={styles.supportingText}>
                    Turn on a source and add at least one planned recipe, manual recipe, or essential item.
                  </Text>
                ) : (
                  groceryItems.map((item) => (
                    <View key={item.key} style={styles.groceryRow}>
                      <Pressable style={styles.groceryCheckRow} onPress={() => toggleCheckedGroceryItem(item.key)}>
                        <View
                          style={[
                            styles.groceryCheckbox,
                            data.checkedGroceryItemKeys.includes(item.key) && styles.groceryCheckboxChecked,
                          ]}
                        >
                          {data.checkedGroceryItemKeys.includes(item.key) ? (
                            <Text style={styles.groceryCheckboxMark}>✓</Text>
                          ) : null}
                        </View>
                        <View style={styles.selectionContent}>
                          <Text
                            style={[
                              styles.groceryItem,
                              data.checkedGroceryItemKeys.includes(item.key) && styles.groceryItemChecked,
                            ]}
                          >
                            {item.label}
                          </Text>
                          <Text style={styles.grocerySources}>{item.recipes.join(", ")}</Text>
                        </View>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

type SectionHeadingProps = {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
};

function SectionHeading({ title, detail, actionLabel, onAction }: SectionHeadingProps) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.ghostButton}>
          <Text style={styles.ghostButtonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  expanded,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: readonly string[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.selectField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.selectTrigger} onPress={onToggle}>
        <Text style={[styles.selectTriggerText, !value && styles.placeholderText]}>
          {value || placeholder}
        </Text>
      </Pressable>
      {expanded ? (
        <ScrollView style={styles.dropdownMenu} nestedScrollEnabled>
          {options.map((option) => (
            <Pressable
              key={`${label}-${option || "empty"}`}
              style={[styles.dropdownOption, value === option && styles.dropdownOptionActive]}
              onPress={() => onSelect(option)}
            >
              <Text style={[styles.dropdownOptionText, value === option && styles.dropdownOptionTextActive]}>
                {option || "No unit"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function NumberScrollField({
  label,
  value,
  placeholder,
  options,
  expanded,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: readonly string[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.selectField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.selectTrigger} onPress={onToggle}>
        <Text style={[styles.selectTriggerText, !value && styles.placeholderText]}>
          {value || placeholder}
        </Text>
      </Pressable>
      {expanded ? (
        <ScrollView style={styles.dropdownMenu} nestedScrollEnabled>
          {options.map((option) => (
            <Pressable
              key={`${label}-${option}`}
              style={[styles.dropdownOption, value === option && styles.dropdownOptionActive]}
              onPress={() => onSelect(option)}
            >
              <Text style={[styles.dropdownOptionText, value === option && styles.dropdownOptionTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function MultiSelectField({
  label,
  values,
  options,
  expanded,
  onToggle,
  onChange,
}: {
  label: string;
  values: string[];
  options: readonly string[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (values: string[]) => void;
}) {
  const summary = values.length > 0 ? values.join(", ") : "Select tags";

  return (
    <View style={styles.selectField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.selectTrigger} onPress={onToggle}>
        <Text style={[styles.selectTriggerText, values.length === 0 && styles.placeholderText]}>
          {summary}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.selectMenu}>
          {options.map((option) => {
            const active = values.includes(option);
            return (
              <FilterChip
                key={`${label}-${option}`}
                label={option}
                active={active}
                onPress={() =>
                  onChange(active ? values.filter((value) => value !== option) : [...values, option])
                }
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function TagsInputField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <View style={styles.selectField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={values.join(", ")}
        onChangeText={(value) =>
          onChange(
            value
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          )
        }
        placeholder="Add tags separated by commas"
        placeholderTextColor="#7c8798"
        style={styles.input}
      />
    </View>
  );
}

function QuantityField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  function getNextValue(direction: "decrease" | "increase") {
    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue)) {
      return direction === "increase" ? "1" : "";
    }

    const step = numericValue >= 1 ? 1 : 0.25;
    const nextValue = direction === "increase" ? numericValue + step : Math.max(0, numericValue - step);
    return nextValue === 0 ? "" : Number(nextValue.toFixed(2)).toString();
  }

  const displayValue = value || "1";

  return (
    <View style={styles.selectField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.quantityControl}>
        <Pressable style={styles.quantityAdjustButton} onPress={() => onChange(getNextValue("decrease"))}>
          <Text style={styles.quantityAdjustButtonLabel}>-</Text>
        </Pressable>
        <TextInput
          value={displayValue}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#7c8798"
          keyboardType="decimal-pad"
          style={styles.quantityEditorInput}
        />
        <Pressable style={styles.quantityAdjustButton} onPress={() => onChange(getNextValue("increase"))}>
          <Text style={styles.quantityAdjustButtonLabel}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function IngredientEditor({
  ingredient,
  quantityExpanded,
  onToggleQuantity,
  unitExpanded,
  onToggleUnit,
  onUpdate,
  onRemove,
}: {
  ingredient: Ingredient;
  quantityExpanded: boolean;
  onToggleQuantity: () => void;
  unitExpanded: boolean;
  onToggleUnit: () => void;
  onUpdate: (key: keyof Ingredient, value: string) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.ingredientCard}>
      <View style={styles.ingredientRow}>
        <View style={styles.quantityFieldWrap}>
          <QuantityField
            label="Qty"
            value={ingredient.quantity}
            placeholder="1"
            onChange={(value) => onUpdate("quantity", value)}
          />
        </View>
        <View style={styles.unitSelectWrap}>
          <SelectField
            label="Unit"
            value={ingredient.unit}
            placeholder="Unit"
            options={UNIT_OPTIONS}
            expanded={unitExpanded}
            onToggle={onToggleUnit}
            onSelect={(value) => onUpdate("unit", value)}
          />
        </View>
      </View>
      <TextInput
        value={ingredient.name}
        onChangeText={(value) => onUpdate("name", value)}
        placeholder="Ingredient name"
        placeholderTextColor="#7c8798"
        style={styles.input}
      />
      <TextInput
        value={ingredient.notes}
        onChangeText={(value) => onUpdate("notes", value)}
        placeholder="Notes"
        placeholderTextColor="#7c8798"
        style={styles.input}
      />
      <Pressable style={styles.ghostButton} onPress={onRemove}>
        <Text style={styles.ghostButtonLabel}>Remove ingredient</Text>
      </Pressable>
    </View>
  );
}

function InstructionEditor({
  label,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.instructionCard}>
      <Text style={styles.stepNumber}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Write the cooking step"
        placeholderTextColor="#7c8798"
        multiline
        style={[styles.input, styles.textArea]}
      />
      <Pressable style={styles.ghostButton} onPress={onRemove}>
        <Text style={styles.ghostButtonLabel}>Remove step</Text>
      </Pressable>
    </View>
  );
}

type RecipeFormProps = {
  draft: Recipe;
  importDraftId?: string;
  onCancel: () => void;
  onSave: (recipe: Recipe, importDraftId?: string) => void;
};

function RecipeForm({ draft, importDraftId, onCancel, onSave }: RecipeFormProps) {
  const [recipe, setRecipe] = useState<Recipe>(normalizeRecipe(draft));
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");

  function openImagePickerMenu() {
    Alert.alert("Add recipe image", "Choose how you want to add the photo.", [
      { text: "Take photo", onPress: () => void pickRecipeImage("camera") },
      { text: "Choose from library", onPress: () => void pickRecipeImage("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function updateIngredient(id: string, key: keyof Ingredient, value: string) {
    setRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, [key]: value } : ingredient
      ),
    }));
    if (key === "unit" || key === "quantity") {
      setExpandedField(null);
    }
  }

  function addIngredient() {
    setRecipe((current) => ({
      ...current,
      ingredients: [...current.ingredients, createEmptyIngredient()],
    }));
  }

  function removeIngredient(id: string) {
    setRecipe((current) => ({
      ...current,
      ingredients:
        current.ingredients.length === 1
          ? [createEmptyIngredient()]
          : current.ingredients.filter((ingredient) => ingredient.id !== id),
    }));
  }

  function updateInstruction(index: number, value: string) {
    setRecipe((current) => ({
      ...current,
      instructions: current.instructions.map((step, stepIndex) => (stepIndex === index ? value : step)),
    }));
  }

  function addInstruction() {
    setRecipe((current) => ({
      ...current,
      instructions: [...current.instructions, ""],
    }));
  }

  function removeInstruction(index: number) {
    setRecipe((current) => ({
      ...current,
      instructions:
        current.instructions.length === 1
          ? [""]
          : current.instructions.filter((_, stepIndex) => stepIndex !== index),
    }));
  }

  function updateSubRecipe(sectionId: string, updater: (section: RecipeSection) => RecipeSection) {
    setRecipe((current) => ({
      ...current,
      subRecipes: current.subRecipes.map((section) => (section.id === sectionId ? updater(section) : section)),
    }));
  }

  function addSubRecipe() {
    setRecipe((current) => ({
      ...current,
      subRecipes: [...current.subRecipes, createEmptyRecipeSection(`Part ${current.subRecipes.length + 1}`)],
    }));
  }

  function removeSubRecipe(sectionId: string) {
    setRecipe((current) => ({
      ...current,
      subRecipes: current.subRecipes.filter((section) => section.id !== sectionId),
    }));
  }

  function updateSubRecipeIngredient(sectionId: string, ingredientId: string, key: keyof Ingredient, value: string) {
    updateSubRecipe(sectionId, (section) => ({
      ...section,
      ingredients: section.ingredients.map((ingredient) =>
        ingredient.id === ingredientId ? { ...ingredient, [key]: value } : ingredient
      ),
    }));
    if (key === "unit" || key === "quantity") {
      setExpandedField(null);
    }
  }

  function addSubRecipeIngredient(sectionId: string) {
    updateSubRecipe(sectionId, (section) => ({
      ...section,
      ingredients: [...section.ingredients, createEmptyIngredient()],
    }));
  }

  function removeSubRecipeIngredient(sectionId: string, ingredientId: string) {
    updateSubRecipe(sectionId, (section) => ({
      ...section,
      ingredients:
        section.ingredients.length === 1
          ? [createEmptyIngredient()]
          : section.ingredients.filter((ingredient) => ingredient.id !== ingredientId),
    }));
  }

  function updateSubRecipeInstruction(sectionId: string, index: number, value: string) {
    updateSubRecipe(sectionId, (section) => ({
      ...section,
      instructions: section.instructions.map((step, stepIndex) => (stepIndex === index ? value : step)),
    }));
  }

  function addSubRecipeInstruction(sectionId: string) {
    updateSubRecipe(sectionId, (section) => ({
      ...section,
      instructions: [...section.instructions, ""],
    }));
  }

  function removeSubRecipeInstruction(sectionId: string, index: number) {
    updateSubRecipe(sectionId, (section) => ({
      ...section,
      instructions:
        section.instructions.length === 1
          ? [""]
          : section.instructions.filter((_, stepIndex) => stepIndex !== index),
    }));
  }

  async function pickRecipeImage(mode: "camera" | "library") {
    setImageError("");

    try {
      if (mode === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setImageError("Camera permission is required to take a photo.");
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]?.uri) {
          setRecipe((current) => ({ ...current, imageUri: result.assets[0].uri }));
        }
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setImageError("Photo library permission is required to import an image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setRecipe((current) => ({ ...current, imageUri: result.assets[0].uri }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image picker error.";
      setImageError("Could not open the image picker.");
      Alert.alert("Image Picker Error", message);
    }
  }

  return (
    <View style={styles.screenBlock}>
      <SectionHeading title="Recipe Editor" detail="Create or finish a recipe for your library" />
      <View style={styles.heroCard}>
        {recipe.imageUri ? <Image source={{ uri: recipe.imageUri }} style={styles.editorImagePreview} /> : null}
        <Text style={styles.fieldLabel}>Recipe image</Text>
        <View style={styles.inlineButtonRow}>
          {recipe.imageUri ? (
            <Pressable
              style={styles.ghostButton}
              onPress={() => {
                setRecipe((current) => ({ ...current, imageUri: "" }));
                setImageError("");
              }}
            >
              <Text style={styles.ghostButtonLabel}>Remove Image</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.secondaryButton} onPress={openImagePickerMenu}>
              <Text style={styles.secondaryButtonLabel}>Add Image</Text>
            </Pressable>
          )}
        </View>
        {imageError ? <Text style={styles.errorText}>{imageError}</Text> : null}
        <TextInput
          value={recipe.title}
          onChangeText={(value) => setRecipe((current) => ({ ...current, title: value }))}
          placeholder="Recipe title"
          placeholderTextColor="#7c8798"
          style={styles.input}
        />
        <TextInput
          value={recipe.description}
          onChangeText={(value) => setRecipe((current) => ({ ...current, description: value }))}
          placeholder="Short description"
          placeholderTextColor="#7c8798"
          multiline
          style={[styles.input, styles.textArea]}
        />

        <MultiSelectField
          label="Categories"
          values={recipe.categories}
          options={CATEGORY_OPTIONS}
          expanded={expandedField === "categories"}
          onToggle={() => setExpandedField((current) => (current === "categories" ? null : "categories"))}
          onChange={(values) =>
            setRecipe((current) => ({
              ...current,
              categories: values.length > 0 ? (values as RecipeCategory[]) : ["Dinner"],
            }))
          }
        />

        <View style={styles.twoColumnRow}>
          <View style={styles.halfInput}>
            <SelectField
              label="Prep time"
              value={recipe.prepTime}
              placeholder="Choose prep time"
              options={PREP_TIME_OPTIONS}
              expanded={expandedField === "prep-time"}
              onToggle={() => setExpandedField((current) => (current === "prep-time" ? null : "prep-time"))}
              onSelect={(value) => {
                setRecipe((current) => ({ ...current, prepTime: value }));
                setExpandedField(null);
              }}
            />
          </View>
          <View style={styles.halfInput}>
            <NumberScrollField
              label="Servings"
              value={recipe.servings}
              placeholder="Choose servings"
              options={SERVING_OPTIONS}
              expanded={expandedField === "servings"}
              onToggle={() => setExpandedField((current) => (current === "servings" ? null : "servings"))}
              onSelect={(value) => {
                setRecipe((current) => ({ ...current, servings: value }));
                setExpandedField(null);
              }}
            />
          </View>
        </View>

        <TagsInputField
          label="Tags"
          values={recipe.tags}
          onChange={(values) => setRecipe((current) => ({ ...current, tags: values }))}
        />

        <TextInput
          value={recipe.sourceUrl}
          onChangeText={(value) =>
            setRecipe((current) => ({
              ...current,
              sourceUrl: value,
              sourceType: detectSourceType(value),
            }))
          }
          placeholder="Source URL if you have one"
          placeholderTextColor="#7c8798"
          autoCapitalize="none"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Main recipe ingredients</Text>
        {recipe.ingredients.map((ingredient) => (
          <IngredientEditor
            key={ingredient.id}
            ingredient={ingredient}
            quantityExpanded={expandedField === `ingredient-quantity-${ingredient.id}`}
            onToggleQuantity={() =>
              setExpandedField((current) =>
                current === `ingredient-quantity-${ingredient.id}` ? null : `ingredient-quantity-${ingredient.id}`
              )
            }
            unitExpanded={expandedField === `ingredient-${ingredient.id}`}
            onToggleUnit={() =>
              setExpandedField((current) => (current === `ingredient-${ingredient.id}` ? null : `ingredient-${ingredient.id}`))
            }
            onUpdate={(key, value) => updateIngredient(ingredient.id, key, value)}
            onRemove={() => removeIngredient(ingredient.id)}
          />
        ))}
        <Pressable style={styles.secondaryButton} onPress={addIngredient}>
          <Text style={styles.secondaryButtonLabel}>Add ingredient</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Main recipe instructions</Text>
        {recipe.instructions.map((step, index) => (
          <InstructionEditor
            key={`${recipe.id}-step-${index}`}
            label={`Step ${index + 1}`}
            value={step}
            onChange={(value) => updateInstruction(index, value)}
            onRemove={() => removeInstruction(index)}
          />
        ))}
        <Pressable style={styles.secondaryButton} onPress={addInstruction}>
          <Text style={styles.secondaryButtonLabel}>Add instruction</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Sub-recipes</Text>
        {recipe.subRecipes.length === 0 ? (
          <Text style={styles.supportingText}>
            Add a nested recipe for things like meatballs, sauce, dressing, topping, or filling.
          </Text>
        ) : null}
        {recipe.subRecipes.map((section) => (
          <View key={section.id} style={styles.subRecipeCard}>
            <TextInput
              value={section.title}
              onChangeText={(value) =>
                updateSubRecipe(section.id, (current) => ({
                  ...current,
                  title: value,
                }))
              }
              placeholder="Sub-recipe title"
              placeholderTextColor="#7c8798"
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>Ingredients</Text>
            {section.ingredients.map((ingredient) => (
              <IngredientEditor
                key={ingredient.id}
                ingredient={ingredient}
                quantityExpanded={expandedField === `sub-quantity-${section.id}-${ingredient.id}`}
                onToggleQuantity={() =>
                  setExpandedField((current) =>
                    current === `sub-quantity-${section.id}-${ingredient.id}`
                      ? null
                      : `sub-quantity-${section.id}-${ingredient.id}`
                  )
                }
                unitExpanded={expandedField === `sub-${section.id}-${ingredient.id}`}
                onToggleUnit={() =>
                  setExpandedField((current) =>
                    current === `sub-${section.id}-${ingredient.id}` ? null : `sub-${section.id}-${ingredient.id}`
                  )
                }
                onUpdate={(key, value) => updateSubRecipeIngredient(section.id, ingredient.id, key, value)}
                onRemove={() => removeSubRecipeIngredient(section.id, ingredient.id)}
              />
            ))}
            <Pressable style={styles.secondaryButton} onPress={() => addSubRecipeIngredient(section.id)}>
              <Text style={styles.secondaryButtonLabel}>Add sub-recipe ingredient</Text>
            </Pressable>

            <Text style={styles.fieldLabel}>Instructions</Text>
            {section.instructions.map((step, index) => (
              <InstructionEditor
                key={`${section.id}-step-${index}`}
                label={`Step ${index + 1}`}
                value={step}
                onChange={(value) => updateSubRecipeInstruction(section.id, index, value)}
                onRemove={() => removeSubRecipeInstruction(section.id, index)}
              />
            ))}
            <Pressable style={styles.secondaryButton} onPress={() => addSubRecipeInstruction(section.id)}>
              <Text style={styles.secondaryButtonLabel}>Add sub-recipe step</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => removeSubRecipe(section.id)}>
              <Text style={styles.ghostButtonLabel}>Remove sub-recipe</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.secondaryButton} onPress={addSubRecipe}>
          <Text style={styles.secondaryButtonLabel}>Add sub-recipe</Text>
        </Pressable>

        <View style={styles.inlineButtonRow}>
          <Pressable style={styles.primaryButton} onPress={() => onSave(recipe, importDraftId)}>
            <Text style={styles.primaryButtonLabel}>Save recipe</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={onCancel}>
            <Text style={styles.ghostButtonLabel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RecipeDetail({
  recipe,
  onBack,
  onEdit,
  onDelete,
}: {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.screenBlock}>
      <SectionHeading
        title={recipe.title}
        detail={`${recipe.categories.join(" • ")} • ${SOURCE_LABELS[recipe.sourceType]}`}
      />
      <View style={styles.heroCard}>
        {recipe.imageUri ? <Image source={{ uri: recipe.imageUri }} style={styles.detailImage} /> : null}
        <Text style={styles.supportingText}>{recipe.description || "No description added."}</Text>
        <View style={styles.metaRow}>
          {recipe.prepTime ? <MetaPill label={recipe.prepTime} /> : null}
          {recipe.servings ? <MetaPill label={`${recipe.servings} servings`} /> : null}
          {recipe.tags.map((tag) => (
            <MetaPill key={tag} label={tag} />
          ))}
        </View>

        <Text style={styles.detailHeading}>Main ingredients</Text>
        {recipe.ingredients.map((ingredient) => (
          <Text key={ingredient.id} style={styles.detailLine}>
            {formatIngredientLine(ingredient)}
          </Text>
        ))}

        <Text style={styles.detailHeading}>Main instructions</Text>
        {recipe.instructions.map((step, index) => (
          <Text key={`${recipe.id}-instruction-${index}`} style={styles.detailLine}>
            {index + 1}. {step}
          </Text>
        ))}

        {recipe.subRecipes.length > 0 ? <Text style={styles.detailHeading}>Sub-recipes</Text> : null}
        {recipe.subRecipes.map((section) => (
          <View key={section.id} style={styles.detailSectionCard}>
            <Text style={styles.subRecipeTitle}>{section.title || "Untitled sub-recipe"}</Text>
            <Text style={styles.subRecipeHeading}>Ingredients</Text>
            {section.ingredients.map((ingredient) => (
              <Text key={ingredient.id} style={styles.detailLine}>
                {formatIngredientLine(ingredient)}
              </Text>
            ))}
            <Text style={styles.subRecipeHeading}>Instructions</Text>
            {section.instructions.map((step, index) => (
              <Text key={`${section.id}-instruction-${index}`} style={styles.detailLine}>
                {index + 1}. {step}
              </Text>
            ))}
          </View>
        ))}

        {recipe.sourceUrl ? (
          <>
            <Text style={styles.detailHeading}>Source</Text>
            <Text style={styles.detailLine}>{recipe.sourceUrl}</Text>
          </>
        ) : null}

        <View style={styles.inlineButtonRow}>
          <Pressable style={styles.secondaryButton} onPress={onEdit}>
            <Text style={styles.secondaryButtonLabel}>Edit</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={onBack}>
            <Text style={styles.ghostButtonLabel}>Back</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={onDelete}>
            <Text style={styles.deleteButtonLabel}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f6f7fb",
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  header: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "#d9dee8",
    gap: 8,
  },
  eyebrow: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    color: "#171a21",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  subtitle: {
    color: "#5f6b7a",
    fontSize: 15,
    lineHeight: 22,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  tab: {
    backgroundColor: "#eef2f7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: "#171a21",
  },
  tabLabel: {
    color: "#394150",
    fontSize: 14,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: "#ffffff",
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 16,
  },
  screenBlock: {
    gap: 14,
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    color: "#171a21",
    fontSize: 24,
    fontWeight: "800",
    flexShrink: 1,
  },
  sectionDetail: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 4,
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d9dee8",
    gap: 12,
  },
  cardTitle: {
    color: "#171a21",
    fontSize: 20,
    fontWeight: "800",
  },
  supportingText: {
    color: "#5f6b7a",
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    lineHeight: 20,
  },
  categoryFilterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#eef2f7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: "#2563eb",
  },
  chipLabel: {
    color: "#394150",
    fontWeight: "700",
  },
  chipLabelActive: {
    color: "#ffffff",
  },
  cardGrid: {
    gap: 12,
  },
  mealPlanCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d9dee8",
    gap: 10,
  },
  mealPlanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  mealPlanAction: {
    backgroundColor: "#eef2f7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  mealPlanActionLabel: {
    color: "#394150",
    fontSize: 13,
    fontWeight: "700",
  },
  recipeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d9dee8",
    gap: 10,
  },
  recipeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recipeCardImage: {
    width: "100%",
    height: 168,
    borderRadius: 18,
    backgroundColor: "#eef2f7",
  },
  recipeCategory: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  favoriteText: {
    color: "#14b8a6",
    fontWeight: "700",
  },
  recipeTitle: {
    color: "#171a21",
    fontSize: 22,
    fontWeight: "800",
  },
  recipeDescription: {
    color: "#5f6b7a",
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    backgroundColor: "#e8edf5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaPillText: {
    color: "#394150",
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dee8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#171a21",
    fontSize: 15,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  fieldLabel: {
    color: "#171a21",
    fontWeight: "800",
    fontSize: 16,
    marginTop: 4,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  halfInput: {
    flex: 1,
  },
  quantityInput: {
    width: 84,
  },
  quantityFieldWrap: {
    width: 152,
  },
  selectField: {
    gap: 8,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityAdjustButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#eef2f7",
    borderWidth: 1,
    borderColor: "#d9dee8",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityAdjustButtonLabel: {
    color: "#171a21",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 22,
  },
  quantityEditorInput: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dee8",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#171a21",
    fontSize: 15,
    textAlign: "center",
  },
  selectTrigger: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dee8",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectTriggerText: {
    color: "#171a21",
    fontSize: 15,
  },
  placeholderText: {
    color: "#7c8798",
  },
  dropdownMenu: {
    maxHeight: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dee8",
    backgroundColor: "#ffffff",
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  dropdownOptionActive: {
    backgroundColor: "#eef2f7",
  },
  dropdownOptionText: {
    color: "#394150",
    fontSize: 15,
    fontWeight: "600",
  },
  dropdownOptionTextActive: {
    color: "#171a21",
  },
  selectMenu: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ingredientCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  ingredientRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  unitSelectWrap: {
    flex: 1,
  },
  instructionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  stepNumber: {
    color: "#2563eb",
    fontWeight: "700",
  },
  subRecipeCard: {
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#cfd8e6",
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#171a21",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonLabel: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonLabel: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dee8",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonLabel: {
    color: "#394150",
    fontWeight: "700",
  },
  deleteButton: {
    backgroundColor: "#dc2626",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonLabel: {
    color: "#ffffff",
    fontWeight: "800",
  },
  inlineButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  selectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  sourcePreviewBlock: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#eef2f7",
    gap: 4,
  },
  sourcePreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  sourcePreviewTitle: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sourcePreviewDetail: {
    color: "#171a21",
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  essentialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  manageEssentialsCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eef2f7",
    gap: 12,
  },
  selectionContent: {
    flex: 1,
  },
  selectionTitle: {
    color: "#171a21",
    fontWeight: "700",
    fontSize: 16,
  },
  selectionDetail: {
    color: "#6b7280",
    marginTop: 4,
  },
  groceryRow: {
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    paddingTop: 12,
    gap: 4,
  },
  groceryCheckRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  groceryCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#aab4c3",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  groceryCheckboxChecked: {
    backgroundColor: "#14b8a6",
    borderColor: "#14b8a6",
  },
  groceryCheckboxMark: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
    lineHeight: 16,
  },
  groceryItem: {
    color: "#171a21",
    fontWeight: "700",
    fontSize: 16,
  },
  groceryItemChecked: {
    color: "#6b7280",
    textDecorationLine: "line-through",
  },
  grocerySources: {
    color: "#6b7280",
    fontSize: 13,
  },
  mealPlanPicker: {
    gap: 8,
    marginTop: 2,
  },
  mealPlanOption: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d9dee8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  mealPlanOptionActive: {
    backgroundColor: "#171a21",
    borderColor: "#171a21",
  },
  mealPlanOptionTitle: {
    color: "#171a21",
    fontSize: 15,
    fontWeight: "700",
  },
  mealPlanOptionTitleActive: {
    color: "#ffffff",
  },
  mealPlanOptionDetail: {
    color: "#6b7280",
    fontSize: 13,
  },
  mealPlanOptionDetailActive: {
    color: "#eef2f7",
  },
  editorImagePreview: {
    width: "100%",
    height: 220,
    borderRadius: 22,
    backgroundColor: "#eef2f7",
  },
  detailImage: {
    width: "100%",
    height: 240,
    borderRadius: 22,
    backgroundColor: "#eef2f7",
  },
  detailHeading: {
    color: "#171a21",
    fontWeight: "800",
    fontSize: 18,
    marginTop: 8,
  },
  detailLine: {
    color: "#394150",
    fontSize: 15,
    lineHeight: 23,
  },
  detailSectionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eef2f7",
    gap: 6,
  },
  subRecipeTitle: {
    color: "#171a21",
    fontWeight: "800",
    fontSize: 17,
  },
  subRecipeHeading: {
    color: "#2563eb",
    fontWeight: "700",
    marginTop: 6,
  },
});
