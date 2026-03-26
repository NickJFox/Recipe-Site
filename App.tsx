import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { CATEGORY_OPTIONS, SOURCE_LABELS } from "./src/constants";
import { sampleData } from "./src/sampleData";
import { loadAppData, saveAppData } from "./src/storage";
import { AppData, ImportDraft, Ingredient, Recipe, RecipeCategory } from "./src/types";
import {
  buildRecipeFromImport,
  cleanRecipe,
  createEmptyIngredient,
  createEmptyRecipe,
  createId,
  detectSourceType,
  guessTitleFromUrl,
  mergeGroceryItems,
} from "./src/utils";

type Screen =
  | { name: "home" }
  | { name: "recipe-form"; draft: Recipe; importDraftId?: string }
  | { name: "recipe-detail"; recipeId: string }
  | { name: "imports" }
  | { name: "grocery" };

const TABS: Array<{ key: "home" | "recipe-form" | "imports" | "grocery"; label: string }> = [
  { key: "home", label: "Recipes" },
  { key: "recipe-form", label: "Add Recipe" },
  { key: "imports", label: "Import" },
  { key: "grocery", label: "Groceries" },
];

export default function App() {
  const [data, setData] = useState<AppData>(sampleData);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | "All">("All");
  const [importUrl, setImportUrl] = useState("");
  const [importNotes, setImportNotes] = useState("");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);

  useEffect(() => {
    async function bootstrap() {
      const stored = await loadAppData();
      if (stored) {
        setData(stored);
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
      selectedCategory === "All" ? true : recipe.category === selectedCategory
    );
  }, [data.recipes, selectedCategory]);

  const groceryItems = useMemo(() => {
    const recipes = data.recipes.filter((recipe) => selectedRecipeIds.includes(recipe.id));
    return mergeGroceryItems(recipes);
  }, [data.recipes, selectedRecipeIds]);

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
    if (!cleaned.title || cleaned.ingredients.length === 0 || cleaned.instructions.length === 0) {
      return;
    }

    setData((current) => {
      const exists = current.recipes.some((item) => item.id === cleaned.id);
      return {
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

  function handleCreateImport() {
    if (!importUrl.trim()) {
      return;
    }

    const draft: ImportDraft = {
      id: createId("import"),
      url: importUrl.trim(),
      sourceType: detectSourceType(importUrl.trim()),
      titleGuess: guessTitleFromUrl(importUrl.trim()),
      notes: importNotes.trim(),
      createdAt: new Date().toISOString(),
    };

    setData((current) => ({
      ...current,
      importDrafts: [draft, ...current.importDrafts],
    }));
    setImportUrl("");
    setImportNotes("");
  }

  function handleRemoveImport(id: string) {
    setData((current) => ({
      ...current,
      importDrafts: current.importDrafts.filter((draft) => draft.id !== id),
    }));
  }

  function toggleRecipeSelection(recipeId: string) {
    setSelectedRecipeIds((current) =>
      current.includes(recipeId) ? current.filter((id) => id !== recipeId) : [...current, recipeId]
    );
  }

  const activeRecipe =
    screen.name === "recipe-detail"
      ? data.recipes.find((recipe) => recipe.id === screen.recipeId)
      : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Recipe Keeper</Text>
          <Text style={styles.title}>Your kitchen, organized for mobile.</Text>
          <Text style={styles.subtitle}>
            Save recipes by category, manually capture dishes, queue link or social imports, and
            build one grocery list from multiple meals.
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
                actionLabel="Manual entry"
                onAction={openNewRecipeForm}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
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
              </ScrollView>

              <View style={styles.cardGrid}>
                {filteredRecipes.map((recipe) => (
                  <Pressable
                    key={recipe.id}
                    style={styles.recipeCard}
                    onPress={() => setScreen({ name: "recipe-detail", recipeId: recipe.id })}
                  >
                    <View style={styles.recipeCardHeader}>
                      <Text style={styles.recipeCategory}>{recipe.category}</Text>
                      <Pressable onPress={() => toggleFavorite(recipe.id)}>
                        <Text style={styles.favoriteText}>{recipe.favorite ? "Saved" : "Save"}</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.recipeTitle}>{recipe.title}</Text>
                    <Text style={styles.recipeDescription}>{recipe.description || "No description yet."}</Text>
                    <View style={styles.metaRow}>
                      <MetaPill label={`${recipe.ingredients.length} ingredients`} />
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
              draft={screen.draft}
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
              <SectionHeading title="Import Recipes" detail="Queue links and social posts for cleanup" />
              <View style={styles.heroCard}>
                <Text style={styles.cardTitle}>Add a recipe link or social post</Text>
                <Text style={styles.supportingText}>
                  Instagram, TikTok, YouTube, and normal recipe URLs are stored as import drafts.
                  This local app does not scrape those services directly, so you can review and finish
                  the recipe details before saving.
                </Text>
                <TextInput
                  value={importUrl}
                  onChangeText={setImportUrl}
                  placeholder="Paste a recipe URL or social video link"
                  placeholderTextColor="#8a7d6f"
                  style={styles.input}
                  autoCapitalize="none"
                />
                <TextInput
                  value={importNotes}
                  onChangeText={setImportNotes}
                  placeholder="Optional notes, caption text, or ingredients you copied"
                  placeholderTextColor="#8a7d6f"
                  multiline
                  style={[styles.input, styles.textArea]}
                />
                <Pressable style={styles.primaryButton} onPress={handleCreateImport}>
                  <Text style={styles.primaryButtonLabel}>Create import draft</Text>
                </Pressable>
              </View>

              <View style={styles.cardGrid}>
                {data.importDrafts.map((draft) => (
                  <View key={draft.id} style={styles.recipeCard}>
                    <Text style={styles.recipeCategory}>{SOURCE_LABELS[draft.sourceType]}</Text>
                    <Text style={styles.recipeTitle}>{draft.titleGuess}</Text>
                    <Text style={styles.recipeDescription}>{draft.url}</Text>
                    <Text style={styles.supportingText}>
                      {draft.notes || "Open this draft and finish the ingredients and instructions manually."}
                    </Text>
                    <View style={styles.inlineButtonRow}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() =>
                          setScreen({
                            name: "recipe-form",
                            draft: buildRecipeFromImport(draft),
                            importDraftId: draft.id,
                          })
                        }
                      >
                        <Text style={styles.secondaryButtonLabel}>Finish recipe</Text>
                      </Pressable>
                      <Pressable style={styles.ghostButton} onPress={() => handleRemoveImport(draft.id)}>
                        <Text style={styles.ghostButtonLabel}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {screen.name === "grocery" && (
            <View style={styles.screenBlock}>
              <SectionHeading title="Grocery List" detail="Combine ingredients from saved recipes" />
              <View style={styles.heroCard}>
                <Text style={styles.cardTitle}>Choose recipes</Text>
                <Text style={styles.supportingText}>
                  Select the recipes you want to cook, and the app will merge ingredient lines into
                  one shopping list.
                </Text>
                {data.recipes.map((recipe) => (
                  <View key={recipe.id} style={styles.selectionRow}>
                    <Pressable
                      style={styles.selectionContent}
                      onPress={() => toggleRecipeSelection(recipe.id)}
                    >
                      <Text style={styles.selectionTitle}>{recipe.title}</Text>
                      <Text style={styles.selectionDetail}>{recipe.category}</Text>
                    </Pressable>
                    <Switch
                      value={selectedRecipeIds.includes(recipe.id)}
                      onValueChange={() => toggleRecipeSelection(recipe.id)}
                      trackColor={{ false: "#d9cbb8", true: "#3f6a52" }}
                      thumbColor="#fffdf8"
                    />
                  </View>
                ))}
              </View>

              <View style={styles.heroCard}>
                <Text style={styles.cardTitle}>Combined shopping list</Text>
                {groceryItems.length === 0 ? (
                  <Text style={styles.supportingText}>Select at least one recipe to generate the list.</Text>
                ) : (
                  groceryItems.map((item) => (
                    <View key={`${item.label}-${item.recipes.join("-")}`} style={styles.groceryRow}>
                      <Text style={styles.groceryItem}>{item.label}</Text>
                      <Text style={styles.grocerySources}>{item.recipes.join(", ")}</Text>
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

type RecipeFormProps = {
  draft: Recipe;
  importDraftId?: string;
  onCancel: () => void;
  onSave: (recipe: Recipe, importDraftId?: string) => void;
};

function RecipeForm({ draft, importDraftId, onCancel, onSave }: RecipeFormProps) {
  const [recipe, setRecipe] = useState<Recipe>({
    ...draft,
    ingredients: draft.ingredients.length > 0 ? draft.ingredients : [createEmptyIngredient()],
    instructions: draft.instructions.length > 0 ? draft.instructions : [""],
  });
  const [tagInput, setTagInput] = useState(recipe.tags.join(", "));

  function updateIngredient(id: string, key: keyof Ingredient, value: string) {
    setRecipe((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) =>
        ingredient.id === id ? { ...ingredient, [key]: value } : ingredient
      ),
    }));
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

  return (
    <View style={styles.screenBlock}>
      <SectionHeading title="Recipe Editor" detail="Create or finish a recipe for your library" />
      <View style={styles.heroCard}>
        <TextInput
          value={recipe.title}
          onChangeText={(value) => setRecipe((current) => ({ ...current, title: value }))}
          placeholder="Recipe title"
          placeholderTextColor="#8a7d6f"
          style={styles.input}
        />
        <TextInput
          value={recipe.description}
          onChangeText={(value) => setRecipe((current) => ({ ...current, description: value }))}
          placeholder="Short description"
          placeholderTextColor="#8a7d6f"
          multiline
          style={[styles.input, styles.textArea]}
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {CATEGORY_OPTIONS.map((category) => (
            <FilterChip
              key={category}
              label={category}
              active={recipe.category === category}
              onPress={() => setRecipe((current) => ({ ...current, category }))}
            />
          ))}
        </ScrollView>

        <View style={styles.twoColumnRow}>
          <TextInput
            value={recipe.prepTime}
            onChangeText={(value) => setRecipe((current) => ({ ...current, prepTime: value }))}
            placeholder="Prep time"
            placeholderTextColor="#8a7d6f"
            style={[styles.input, styles.halfInput]}
          />
          <TextInput
            value={recipe.servings}
            onChangeText={(value) => setRecipe((current) => ({ ...current, servings: value }))}
            placeholder="Servings"
            placeholderTextColor="#8a7d6f"
            style={[styles.input, styles.halfInput]}
          />
        </View>

        <TextInput
          value={tagInput}
          onChangeText={(value) => {
            setTagInput(value);
            setRecipe((current) => ({
              ...current,
              tags: value.split(",").map((tag) => tag.trim()).filter(Boolean),
            }));
          }}
          placeholder="Tags separated by commas"
          placeholderTextColor="#8a7d6f"
          style={styles.input}
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
          placeholderTextColor="#8a7d6f"
          autoCapitalize="none"
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>Ingredients</Text>
        {recipe.ingredients.map((ingredient) => (
          <View key={ingredient.id} style={styles.ingredientCard}>
            <View style={styles.twoColumnRow}>
              <TextInput
                value={ingredient.quantity}
                onChangeText={(value) => updateIngredient(ingredient.id, "quantity", value)}
                placeholder="Qty"
                placeholderTextColor="#8a7d6f"
                style={[styles.input, styles.thirdInput]}
              />
              <TextInput
                value={ingredient.unit}
                onChangeText={(value) => updateIngredient(ingredient.id, "unit", value)}
                placeholder="Unit"
                placeholderTextColor="#8a7d6f"
                style={[styles.input, styles.thirdInput]}
              />
              <TextInput
                value={ingredient.name}
                onChangeText={(value) => updateIngredient(ingredient.id, "name", value)}
                placeholder="Ingredient name"
                placeholderTextColor="#8a7d6f"
                style={[styles.input, styles.growInput]}
              />
            </View>
            <TextInput
              value={ingredient.notes}
              onChangeText={(value) => updateIngredient(ingredient.id, "notes", value)}
              placeholder="Notes"
              placeholderTextColor="#8a7d6f"
              style={styles.input}
            />
            <Pressable style={styles.ghostButton} onPress={() => removeIngredient(ingredient.id)}>
              <Text style={styles.ghostButtonLabel}>Remove ingredient</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.secondaryButton} onPress={addIngredient}>
          <Text style={styles.secondaryButtonLabel}>Add ingredient</Text>
        </Pressable>

        <Text style={styles.fieldLabel}>Instructions</Text>
        {recipe.instructions.map((step, index) => (
          <View key={`${recipe.id}-step-${index}`} style={styles.instructionCard}>
            <Text style={styles.stepNumber}>Step {index + 1}</Text>
            <TextInput
              value={step}
              onChangeText={(value) => updateInstruction(index, value)}
              placeholder="Write the cooking step"
              placeholderTextColor="#8a7d6f"
              multiline
              style={[styles.input, styles.textArea]}
            />
            <Pressable style={styles.ghostButton} onPress={() => removeInstruction(index)}>
              <Text style={styles.ghostButtonLabel}>Remove step</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.secondaryButton} onPress={addInstruction}>
          <Text style={styles.secondaryButtonLabel}>Add instruction</Text>
        </Pressable>

        <View style={styles.inlineButtonRow}>
          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              onSave(
                {
                  ...recipe,
                  tags: tagInput.split(",").map((tag) => tag.trim()).filter(Boolean),
                },
                importDraftId
              )
            }
          >
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
      <SectionHeading title={recipe.title} detail={`${recipe.category} • ${SOURCE_LABELS[recipe.sourceType]}`} />
      <View style={styles.heroCard}>
        <Text style={styles.supportingText}>{recipe.description || "No description added."}</Text>
        <View style={styles.metaRow}>
          {recipe.prepTime ? <MetaPill label={recipe.prepTime} /> : null}
          {recipe.servings ? <MetaPill label={`${recipe.servings} servings`} /> : null}
          {recipe.tags.map((tag) => (
            <MetaPill key={tag} label={tag} />
          ))}
        </View>

        <Text style={styles.detailHeading}>Ingredients</Text>
        {recipe.ingredients.map((ingredient) => (
          <Text key={ingredient.id} style={styles.detailLine}>
            {ingredient.quantity ? `${ingredient.quantity} ` : ""}
            {ingredient.unit ? `${ingredient.unit} ` : ""}
            {ingredient.name}
            {ingredient.notes ? ` (${ingredient.notes})` : ""}
          </Text>
        ))}

        <Text style={styles.detailHeading}>Instructions</Text>
        {recipe.instructions.map((step, index) => (
          <Text key={`${recipe.id}-instruction-${index}`} style={styles.detailLine}>
            {index + 1}. {step}
          </Text>
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
    backgroundColor: "#f4ede0",
  },
  appShell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  header: {
    backgroundColor: "#fff9f1",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    gap: 8,
  },
  eyebrow: {
    color: "#8d4a28",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  title: {
    color: "#1f2f25",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  subtitle: {
    color: "#5c564f",
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
    backgroundColor: "#eadbc7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: "#1f2f25",
  },
  tabLabel: {
    color: "#5a4636",
    fontSize: 14,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: "#fff9f1",
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
    color: "#1f2f25",
    fontSize: 24,
    fontWeight: "800",
  },
  sectionDetail: {
    color: "#766858",
    fontSize: 14,
    marginTop: 4,
  },
  heroCard: {
    backgroundColor: "#fff9f1",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    gap: 12,
  },
  cardTitle: {
    color: "#1f2f25",
    fontSize: 20,
    fontWeight: "800",
  },
  supportingText: {
    color: "#655d54",
    fontSize: 14,
    lineHeight: 21,
  },
  chipScroll: {
    marginHorizontal: -2,
  },
  chip: {
    backgroundColor: "#eadbc7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    marginRight: 10,
  },
  chipActive: {
    backgroundColor: "#b85c38",
  },
  chipLabel: {
    color: "#5a4636",
    fontWeight: "700",
  },
  chipLabelActive: {
    color: "#fff9f1",
  },
  cardGrid: {
    gap: 12,
  },
  recipeCard: {
    backgroundColor: "#fff9f1",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    gap: 10,
  },
  recipeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recipeCategory: {
    color: "#8d4a28",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  favoriteText: {
    color: "#3f6a52",
    fontWeight: "700",
  },
  recipeTitle: {
    color: "#1f2f25",
    fontSize: 22,
    fontWeight: "800",
  },
  recipeDescription: {
    color: "#655d54",
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    backgroundColor: "#f0e4d4",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaPillText: {
    color: "#5a4636",
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#f8f0e5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#1f2f25",
    fontSize: 15,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  fieldLabel: {
    color: "#1f2f25",
    fontWeight: "800",
    fontSize: 16,
    marginTop: 4,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  halfInput: {
    flex: 1,
  },
  thirdInput: {
    width: 76,
  },
  growInput: {
    flex: 1,
  },
  ingredientCard: {
    backgroundColor: "#fdf6ed",
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#eadbc7",
  },
  instructionCard: {
    backgroundColor: "#fdf6ed",
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#eadbc7",
  },
  stepNumber: {
    color: "#8d4a28",
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#1f2f25",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonLabel: {
    color: "#fff9f1",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: "#b85c38",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonLabel: {
    color: "#fff9f1",
    fontWeight: "800",
    fontSize: 15,
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonLabel: {
    color: "#5a4636",
    fontWeight: "700",
  },
  deleteButton: {
    backgroundColor: "#7a2f1e",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonLabel: {
    color: "#fff9f1",
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
  selectionContent: {
    flex: 1,
  },
  selectionTitle: {
    color: "#1f2f25",
    fontWeight: "700",
    fontSize: 16,
  },
  selectionDetail: {
    color: "#766858",
    marginTop: 4,
  },
  groceryRow: {
    borderTopWidth: 1,
    borderTopColor: "#eadbc7",
    paddingTop: 12,
    gap: 4,
  },
  groceryItem: {
    color: "#1f2f25",
    fontWeight: "700",
    fontSize: 16,
  },
  grocerySources: {
    color: "#766858",
    fontSize: 13,
  },
  detailHeading: {
    color: "#1f2f25",
    fontWeight: "800",
    fontSize: 18,
    marginTop: 8,
  },
  detailLine: {
    color: "#4e473f",
    fontSize: 15,
    lineHeight: 23,
  },
});
