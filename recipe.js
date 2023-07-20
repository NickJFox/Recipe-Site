window.addEventListener("DOMContentLoaded", () => {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
  
    const recipeId = urlParams.get("id");
    const recipeTitle = decodeURIComponent(urlParams.get("title"));
  
    // Retrieve the recipe details and display them on the page
    fetchRecipeDetails(recipeId)
      .then((recipe) => {
        document.getElementById("recipe-title").textContent = recipe.title;
        document.getElementById("recipe-image").src = recipe.image;
  
        const ingredientsList = document.getElementById("recipe-ingredients");
        recipe.extendedIngredients.forEach((ingredient) => {
          const listItem = document.createElement("li");
          listItem.textContent = ingredient.original;
          ingredientsList.appendChild(listItem);
        });
  
        const instructionsList = document.getElementById("recipe-instructions");
        recipe.analyzedInstructions[0].steps.forEach((step) => {
          const listItem = document.createElement("li");
          listItem.textContent = step.step;
          instructionsList.appendChild(listItem);
        });
  
        // Create and append the save button
        const saveButton = document.createElement("button");
        saveButton.textContent = "Save Recipe";
        document.getElementById("save-button-container").appendChild(saveButton);
  
        // Add event listener to the save button
        saveButton.addEventListener("click", () => {
          saveRecipe(recipe);
        });
      })
      .catch((error) => {
        console.error("Failed to fetch recipe details:", error);
      });
  
    // Handle the back button click event
    document.getElementById("back-button").addEventListener("click", () => {
      window.history.back();
    });
  });
  
  // Fetch recipe details from Spoonacular API
  async function fetchRecipeDetails(recipeId) {
    const apiKey = "caa6dafae0294447ac03b6335965a5b1"; // Your Spoonacular API key
    const url = `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${apiKey}`;
    const response = await fetch(url);
  
    if (!response.ok) {
      throw new Error("Failed to fetch recipe details from the API.");
    }
  
    const data = await response.json();
    return data;
  }
  
  // Save the recipe to localStorage
  function saveRecipe(recipe) {
    // Retrieve the saved recipes from localStorage or initialize an empty array if it doesn't exist
    const savedRecipes = JSON.parse(localStorage.getItem("savedRecipes")) || [];
  
    // Check if the recipe is already saved
    const existingRecipe = savedRecipes.find((savedRecipe) => savedRecipe.id === recipe.id);
  
    if (!existingRecipe) {
      // Add the recipe to the saved recipes array
      savedRecipes.push(recipe);
  
      // Save the updated array back to localStorage
      localStorage.setItem("savedRecipes", JSON.stringify(savedRecipes));
      alert("Recipe saved successfully!");
    } else {
      alert("Recipe is already saved!");
    }
  }
  