let currentPage = 1;
const recipesPerPage = 12;
let currentSearchQuery = "";

// Fetch recipes from Spoonacular API
async function fetchRecipes(page, query) {
  const apiKey = "caa6dafae0294447ac03b6335965a5b1"; // Your Spoonacular API key
  const url = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${apiKey}&offset=${(page - 1) * recipesPerPage}&number=${recipesPerPage}&query=${encodeURIComponent(query)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch recipes from the API.");
  }

  const data = await response.json();
  return data.results;
}

// Display the list of recipes
function renderRecipeList(recipes) {
  const recipeList = document.getElementById("recipes");
  recipeList.innerHTML = ""; // Clear existing recipes

  recipes.forEach((recipe) => {
    const listItem = document.createElement("li");
    const recipeImage = document.createElement("img");
    const recipeTitle = document.createElement("span");
    const saveButton = document.createElement("button");

    listItem.classList.add("recipe-item");
    recipeImage.src = recipe.image;
    recipeImage.alt = recipe.title;
    recipeTitle.textContent = recipe.title;
    saveButton.textContent = "Save Recipe";

    listItem.appendChild(recipeTitle);
    listItem.appendChild(recipeImage);
    listItem.appendChild(saveButton);

    listItem.addEventListener("click", () => {
      displayRecipeDetails(recipe.id, recipe.title);
    });

    saveButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent the recipe item click event from firing

      saveRecipe(recipe); // Call the function to save the recipe
    });

    recipeList.appendChild(listItem);
  });
}


// Save the recipe to localStorage
function saveRecipe(recipe) {
  // Retrieve the saved recipes from localStorage or initialize an empty array if it doesn't exist
  const savedRecipes = JSON.parse(localStorage.getItem('savedRecipes')) || [];

  // Check if the recipe is already saved
  const existingRecipe = savedRecipes.find((savedRecipe) => savedRecipe.id === recipe.id);

  if (!existingRecipe) {
    // Add the recipe to the saved recipes array
    savedRecipes.push(recipe);

    // Save the updated array back to localStorage
    localStorage.setItem('savedRecipes', JSON.stringify(savedRecipes));
  }
}

// Load saved recipes on the "saved.html" page
function loadSavedRecipes() {
  const savedRecipeList = document.getElementById('savedrecipes');

  // Retrieve the saved recipes from localStorage or initialize an empty array if it doesn't exist
  const savedRecipes = JSON.parse(localStorage.getItem('savedRecipes')) || [];

  // Clear existing saved recipes
  savedRecipeList.innerHTML = "";

  savedRecipes.forEach((recipe) => {
    const listItem = document.createElement('li');
    listItem.classList.add("recipe-item");

    const recipeImage = document.createElement('img');
    recipeImage.src = recipe.image;
    recipeImage.alt = recipe.title;

    const recipeTitle = document.createElement('span');
    recipeTitle.textContent = recipe.title;

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';

    listItem.appendChild(recipeTitle);
    listItem.appendChild(recipeImage);
    listItem.appendChild(removeButton);

    listItem.addEventListener('click', () => {
      displayRecipeDetails(recipe.id, recipe.title);
    });

    removeButton.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent the recipe item click event from firing

      removeRecipe(recipe.id); // Call the function to remove the recipe
      savedRecipeList.removeChild(listItem); // Remove the list item from the DOM
    });

    savedRecipeList.appendChild(listItem);
  });
  // Create the back button
  const backButton = document.createElement('button');
  backButton.id = 'savedback-button';
  backButton.textContent = 'Back';

  // Attach the event listener to the back button
  backButton.addEventListener('click', () => {
    // Redirect to index.html
    window.location.href = 'index.html';
  });

  // Append the back button to the document body
  document.body.appendChild(backButton);
}

// Remove the recipe from localStorage
function removeRecipe(recipeId) {
  // Retrieve the saved recipes from localStorage or initialize an empty array if it doesn't exist
  const savedRecipes = JSON.parse(localStorage.getItem('savedRecipes')) || [];

  // Find the index of the recipe to remove
  const recipeIndex = savedRecipes.findIndex((savedRecipe) => savedRecipe.id === recipeId);

  if (recipeIndex !== -1) {
    // Remove the recipe from the saved recipes array
    savedRecipes.splice(recipeIndex, 1);

    // Save the updated array back to localStorage
    localStorage.setItem('savedRecipes', JSON.stringify(savedRecipes));
  }
}

// Call the function to load saved recipes on page load
window.addEventListener('DOMContentLoaded', loadSavedRecipes);

// Attach event handler to "View Saved Recipes" button
document.getElementById("view-saved").addEventListener("click", viewSavedRecipes);

// Function to redirect to "saved.html"
function viewSavedRecipes() {
  window.location.href = "saved.html";
}

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

// Display the selected recipe's details and redirect to recipe.html
async function displayRecipeDetails(recipeId, recipeTitle) {
  try {
    const recipe = await fetchRecipeDetails(recipeId);
    const queryString = `?id=${recipe.id}&title=${encodeURIComponent(recipeTitle)}`; // Create URL parameters

    // Redirect to recipe.html with the recipe details as URL parameters
    window.location.href = `recipe.html${queryString}`;
  } catch (error) {
    console.error(error.message);
  }
}

// Load more recipes
document.getElementById("load-more").addEventListener("click", loadMoreRecipes);

async function loadMoreRecipes() {
  try {
    currentPage++;
    const recipes = await fetchRecipes(currentPage, currentSearchQuery);
    renderRecipeList(recipes);
  } catch (error) {
    console.error(error.message);
  }
}

// Attach event handler to search button
document.getElementById("search-button").addEventListener("click", performSearch);

// Attach event handler to search input field for Enter key
document.getElementById("search-input").addEventListener("keydown", (event) => {
  if (event.keyCode === 13) {
    performSearch();
  }
});

// Initial setup
function performSearch() {
  const searchQuery = document.getElementById("search-input").value.trim();
  if (searchQuery === currentSearchQuery) {
    return;
  }

  currentSearchQuery = searchQuery;
  currentPage = 1; // Reset current page

  // Fetch and render the new recipes based on the search query
  fetchAndRenderRecipes();
}

// Fetch and render recipes based on the current search query
async function fetchAndRenderRecipes() {
  try {
    const recipes = await fetchRecipes(currentPage, currentSearchQuery);
    renderRecipeList(recipes);
  } catch (error) {
    console.error(error.message);
  }
}


// Pre-load recipes on page load
window.addEventListener("DOMContentLoaded", fetchAndRenderRecipes);

