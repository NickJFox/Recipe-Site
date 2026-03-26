import { AppData } from "./types";
import { createId } from "./utils";

export const sampleData: AppData = {
  recipes: [
    {
      id: createId("recipe"),
      title: "Lemon Garlic Pasta",
      description: "A fast weeknight pasta with lemon, garlic, and parmesan.",
      category: "Dinner",
      tags: ["quick", "vegetarian"],
      sourceType: "manual",
      sourceUrl: "",
      sourceLabel: "",
      ingredients: [
        { id: createId("ingredient"), name: "spaghetti", quantity: "12", unit: "oz", notes: "" },
        { id: createId("ingredient"), name: "olive oil", quantity: "2", unit: "tbsp", notes: "" },
        { id: createId("ingredient"), name: "garlic", quantity: "4", unit: "cloves", notes: "minced" },
        { id: createId("ingredient"), name: "lemon", quantity: "1", unit: "", notes: "zest and juice" },
        { id: createId("ingredient"), name: "parmesan", quantity: "0.5", unit: "cup", notes: "grated" },
      ],
      instructions: [
        "Cook the pasta in salted water until al dente.",
        "Warm olive oil and garlic in a skillet without browning the garlic.",
        "Toss the pasta with lemon zest, lemon juice, and parmesan.",
      ],
      servings: "4",
      prepTime: "20 min",
      favorite: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: createId("recipe"),
      title: "Overnight Berry Oats",
      description: "Meal-prep breakfast with berries, chia, and yogurt.",
      category: "Breakfast",
      tags: ["meal prep", "high protein"],
      sourceType: "website",
      sourceUrl: "https://example.com/overnight-berry-oats",
      sourceLabel: "example.com",
      ingredients: [
        { id: createId("ingredient"), name: "rolled oats", quantity: "1", unit: "cup", notes: "" },
        { id: createId("ingredient"), name: "milk", quantity: "1", unit: "cup", notes: "" },
        { id: createId("ingredient"), name: "chia seeds", quantity: "1", unit: "tbsp", notes: "" },
        { id: createId("ingredient"), name: "greek yogurt", quantity: "0.5", unit: "cup", notes: "" },
        { id: createId("ingredient"), name: "berries", quantity: "1", unit: "cup", notes: "" },
      ],
      instructions: [
        "Mix oats, milk, chia seeds, and yogurt in a jar.",
        "Refrigerate overnight.",
        "Top with berries before serving.",
      ],
      servings: "2",
      prepTime: "10 min",
      favorite: false,
      createdAt: new Date().toISOString(),
    },
  ],
  importDrafts: [],
};
