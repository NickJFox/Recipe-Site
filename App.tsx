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
import { AppData, ImportDraft, Ingredient, Recipe, RecipeCategory, RecipeSection } from "./src/types";
import {
  buildRecipeFromImport,
  cleanRecipe,
  createEmptyIngredient,
  createEmptyRecipe,
  createEmptyRecipeSection,
  createId,
  detectSourceType,
  getRecipeIngredientCount,
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
  { key: "imports", label: "Meal Plan" },
  { key: "grocery", label: "Groceries" },
];

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
  const [data, setData] = useState<AppData>({
    recipes: sampleData.recipes.map(normalizeRecipe),
    importDrafts: sampleData.importDrafts,
  });
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
        setData({
          recipes: stored.recipes.map((recipe) => normalizeRecipe(recipe as Recipe)),
          importDrafts: stored.importDrafts,
        });
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
    if (!cleaned.title || !hasRecipeContent(cleaned)) {
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
          <Text style={styles.eyebrow}>Recipe Book</Text>
          <Text style={styles.title}>Recipes you love - Building meal plans and grocery lists.</Text>
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
                            draft: normalizeRecipe(buildRecipeFromImport(draft)),
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
                      <Text style={styles.selectionDetail}>{recipe.categories.join(" • ")}</Text>
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
        placeholderTextColor="#8a7d6f"
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

  return (
    <View style={styles.selectField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.quantityControl}>
        <Pressable style={styles.quantityAdjustButton} onPress={() => onChange(getNextValue("decrease"))}>
          <Text style={styles.quantityAdjustButtonLabel}>-</Text>
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#8a7d6f"
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
        placeholderTextColor="#8a7d6f"
        style={styles.input}
      />
      <TextInput
        value={ingredient.notes}
        onChangeText={(value) => onUpdate("notes", value)}
        placeholder="Notes"
        placeholderTextColor="#8a7d6f"
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
        placeholderTextColor="#8a7d6f"
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
          placeholderTextColor="#8a7d6f"
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
              placeholderTextColor="#8a7d6f"
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
    flexShrink: 1,
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
  errorText: {
    color: "#7a2f1e",
    fontSize: 14,
    lineHeight: 20,
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
  recipeCardImage: {
    width: "100%",
    height: 168,
    borderRadius: 18,
    backgroundColor: "#eadbc7",
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
    backgroundColor: "#eadbc7",
    borderWidth: 1,
    borderColor: "#d7c9b6",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityAdjustButtonLabel: {
    color: "#1f2f25",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 22,
  },
  quantityEditorInput: {
    flex: 1,
    backgroundColor: "#f8f0e5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#1f2f25",
    fontSize: 15,
    textAlign: "center",
  },
  selectTrigger: {
    backgroundColor: "#f8f0e5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectTriggerText: {
    color: "#1f2f25",
    fontSize: 15,
  },
  placeholderText: {
    color: "#8a7d6f",
  },
  dropdownMenu: {
    maxHeight: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7c9b6",
    backgroundColor: "#fffdf8",
  },
  dropdownOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eadbc7",
  },
  dropdownOptionActive: {
    backgroundColor: "#eadbc7",
  },
  dropdownOptionText: {
    color: "#5a4636",
    fontSize: 15,
    fontWeight: "600",
  },
  dropdownOptionTextActive: {
    color: "#1f2f25",
  },
  selectMenu: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ingredientCard: {
    backgroundColor: "#fdf6ed",
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#eadbc7",
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
  subRecipeCard: {
    backgroundColor: "#fff4e6",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e3c8a7",
    gap: 12,
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
  editorImagePreview: {
    width: "100%",
    height: 220,
    borderRadius: 22,
    backgroundColor: "#eadbc7",
  },
  detailImage: {
    width: "100%",
    height: 240,
    borderRadius: 22,
    backgroundColor: "#eadbc7",
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
  detailSectionCard: {
    backgroundColor: "#fdf6ed",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eadbc7",
    gap: 6,
  },
  subRecipeTitle: {
    color: "#1f2f25",
    fontWeight: "800",
    fontSize: 17,
  },
  subRecipeHeading: {
    color: "#8d4a28",
    fontWeight: "700",
    marginTop: 6,
  },
});
