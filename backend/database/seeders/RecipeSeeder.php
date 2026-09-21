<?php

namespace Database\Seeders;

use App\Models\Recipe;
use Illuminate\Database\Seeder;

class RecipeSeeder extends Seeder
{
    /**
     * A starter library of global recipes (user_id null, same "seeded,
     * shared, read-only from the API" pattern as IngredientReference) --
     * what GrocerySmartListPage's "Recipes you can make" section matches
     * a list's items against, and what GroceryRecipesPage's browsing
     * library filters by meal type. Ingredient names are written to
     * match IngredientReferenceSeeder's canonical spellings wherever
     * possible, so a plain name match (see
     * lib/spaces/grocery/recipeMatching.ts) finds real overlap instead
     * of everything showing as "missing".
     *
     * `tags` deliberately mixes two kinds of label in one array (no
     * separate column for it): meal-type tags ("breakfast"/"lunch"/
     * "dinner"/"snack" -- see MEAL_TYPE_TAGS on the frontend, what the
     * browsing library's filter pills use) and everything else
     * ("quick"/"vegetarian"/"high-protein"/...), shown as plain chips on
     * a recipe card. A recipe can carry more than one meal-type tag
     * (an omelette works for breakfast or lunch) -- the browsing filter
     * just checks "is this tag present", same mechanism
     * RecipeController's `?tag=` filter already uses.
     */
    public function run(): void
    {
        $recipes = [
            [
                'title' => 'Chicken & Broccoli Bowl',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['lunch', 'dinner', 'high-protein', 'quick'],
                'steps' => [
                    'Cook the rice according to the package.',
                    'Season and pan-sear the chicken until cooked through, then slice.',
                    'Steam the broccoli until just tender.',
                    'Combine rice, chicken and broccoli in a bowl, drizzle with olive oil.',
                ],
                'ingredients' => ['Chicken', 'Broccoli', 'White rice', 'Garlic', 'Olive oil'],
            ],
            [
                'title' => 'Veggie Stir Fry',
                'image_key' => 'nutrition-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['lunch', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Heat oil in a wok or large pan.',
                    'Stir fry the vegetables in order of how long they take to cook.',
                    'Add soy sauce and garlic, toss for another minute.',
                    'Serve over rice or noodles.',
                ],
                'ingredients' => ['Bell peppers', 'Broccoli', 'Carrots', 'Onion', 'Garlic', 'Soy sauce', 'Vegetable oil'],
            ],
            [
                'title' => 'Classic Omelette',
                'image_key' => 'egg-outline',
                'time_minutes' => 10,
                'difficulty' => 'Easy',
                'tags' => ['breakfast', 'vegetarian', 'quick'],
                'steps' => [
                    'Whisk the eggs with a pinch of salt.',
                    'Sauté the onion and bell peppers until soft.',
                    'Pour the eggs over the vegetables and cook until set.',
                    'Fold and top with cheese.',
                ],
                'ingredients' => ['Eggs', 'Onion', 'Bell peppers', 'Cheddar cheese', 'Butter'],
            ],
            [
                'title' => 'Greek Yogurt Parfait',
                'image_key' => 'ice-cream-outline',
                'time_minutes' => 5,
                'difficulty' => 'Easy',
                'tags' => ['breakfast', 'snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Layer Greek yogurt, granola and berries in a glass.',
                    'Drizzle with honey.',
                ],
                'ingredients' => ['Greek yogurt', 'Granola', 'Blueberries', 'Strawberries', 'Honey'],
            ],
            [
                'title' => 'Baked Salmon & Asparagus',
                'image_key' => 'fish-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['dinner', 'high-protein'],
                'steps' => [
                    'Preheat the oven to 200°C (400°F).',
                    'Place salmon and asparagus on a tray, drizzle with olive oil, lemon and salt.',
                    'Bake for 15-18 minutes until the salmon flakes easily.',
                ],
                'ingredients' => ['Salmon', 'Asparagus', 'Lemons', 'Olive oil', 'Garlic'],
            ],
            [
                'title' => 'Black Bean Tacos',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['lunch', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Warm the black beans with cumin and chili powder.',
                    'Warm the tortillas.',
                    'Fill with beans, lettuce, tomatoes and cheese.',
                ],
                'ingredients' => ['Black beans', 'Tortillas', 'Lettuce', 'Tomatoes', 'Cheddar cheese', 'Cumin'],
            ],
            [
                'title' => 'Beef & Potato Stew',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 90,
                'difficulty' => 'Medium',
                'tags' => ['dinner', 'high-protein', 'comfort-food'],
                'steps' => [
                    'Brown the beef in a pot.',
                    'Add onion, carrots and garlic, cook until soft.',
                    'Add potatoes and beef broth, simmer for an hour until tender.',
                ],
                'ingredients' => ['Beef', 'Potatoes', 'Carrots', 'Onion', 'Garlic', 'Beef broth'],
            ],
            [
                'title' => 'Quinoa Salad',
                'image_key' => 'leaf-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['lunch', 'vegetarian', 'quick'],
                'steps' => [
                    'Cook the quinoa and let it cool.',
                    'Chop the cucumber, tomatoes and bell peppers.',
                    'Toss everything with olive oil, lemon and feta.',
                ],
                'ingredients' => ['Quinoa', 'Cucumber', 'Cherry tomatoes', 'Bell peppers', 'Feta cheese', 'Olive oil', 'Lemons'],
            ],
            [
                'title' => 'Turkey Chili',
                'image_key' => 'flame-outline',
                'time_minutes' => 40,
                'difficulty' => 'Medium',
                'tags' => ['dinner', 'high-protein'],
                'steps' => [
                    'Brown the ground turkey with onion and garlic.',
                    'Add canned tomatoes, black beans and spices.',
                    'Simmer for 25-30 minutes.',
                ],
                'ingredients' => ['Turkey', 'Onion', 'Garlic', 'Canned tomatoes', 'Black beans', 'Chili powder', 'Cumin'],
            ],
            [
                'title' => 'Peanut Butter Banana Toast',
                'image_key' => 'cafe-outline',
                'time_minutes' => 5,
                'difficulty' => 'Easy',
                'tags' => ['breakfast', 'snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Toast the bread.',
                    'Spread peanut butter and top with sliced banana.',
                ],
                'ingredients' => ['Bread', 'Peanut butter', 'Bananas'],
            ],
            [
                'title' => 'Shrimp Fried Rice',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['lunch', 'dinner', 'high-protein', 'quick'],
                'steps' => [
                    'Scramble the eggs in a hot pan, set aside.',
                    'Stir fry the shrimp with garlic and green onion.',
                    'Add cooked rice and soy sauce, toss with the eggs.',
                ],
                'ingredients' => ['Shrimp', 'White rice', 'Eggs', 'Green onion', 'Garlic', 'Soy sauce'],
            ],
            [
                'title' => 'Caprese Pasta',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['lunch', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Cook the pasta until al dente.',
                    'Toss with cherry tomatoes, mozzarella and basil.',
                    'Drizzle with olive oil and season.',
                ],
                'ingredients' => ['Whole wheat pasta', 'Cherry tomatoes', 'Mozzarella', 'Basil', 'Olive oil'],
            ],
            [
                'title' => 'Chickpea Curry',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['dinner', 'vegetarian'],
                'steps' => [
                    'Sauté onion and garlic until soft.',
                    'Add chickpeas, coconut milk and spices, simmer 15 minutes.',
                    'Serve over rice.',
                ],
                'ingredients' => ['Chickpeas', 'Onion', 'Garlic', 'Coconut milk', 'White rice', 'Chili powder'],
            ],
            [
                'title' => 'Overnight Oats',
                'image_key' => 'cafe-outline',
                'time_minutes' => 5,
                'difficulty' => 'Easy',
                'tags' => ['breakfast', 'vegetarian', 'quick'],
                'steps' => [
                    'Combine oats, milk and honey in a jar.',
                    'Refrigerate overnight.',
                    'Top with blueberries before eating.',
                ],
                'ingredients' => ['Oats', 'Milk', 'Honey', 'Blueberries'],
            ],
            [
                'title' => 'Pork Chops with Sweet Potato',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 35,
                'difficulty' => 'Medium',
                'tags' => ['dinner', 'high-protein'],
                'steps' => [
                    'Season and pan-sear the pork chops.',
                    'Roast the sweet potatoes with olive oil until tender.',
                    'Serve together with steamed green beans.',
                ],
                'ingredients' => ['Pork', 'Sweet potatoes', 'Green beans', 'Olive oil'],
            ],
            [
                'title' => 'Tuna Salad Sandwich',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 10,
                'difficulty' => 'Easy',
                'tags' => ['lunch', 'snack', 'high-protein', 'quick'],
                'steps' => [
                    'Mix tuna with mayonnaise, celery and onion.',
                    'Spread on bread with lettuce.',
                ],
                'ingredients' => ['Tuna', 'Mayonnaise', 'Celery', 'Onion', 'Bread', 'Lettuce'],
            ],
            [
                'title' => 'Apple with Peanut Butter',
                'image_key' => 'nutrition-outline',
                'time_minutes' => 3,
                'difficulty' => 'Easy',
                'tags' => ['snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Slice the apple.',
                    'Serve with peanut butter for dipping.',
                ],
                'ingredients' => ['Apples', 'Peanut butter'],
            ],
            [
                'title' => 'Trail Mix Cup',
                'image_key' => 'nutrition-outline',
                'time_minutes' => 2,
                'difficulty' => 'Easy',
                'tags' => ['snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Portion the trail mix into a cup.',
                ],
                'ingredients' => ['Trail mix'],
            ],
            [
                'title' => 'Carrot & Celery Sticks with Peanut Butter',
                'image_key' => 'nutrition-outline',
                'time_minutes' => 5,
                'difficulty' => 'Easy',
                'tags' => ['snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Cut the carrots and celery into sticks.',
                    'Serve with peanut butter for dipping.',
                ],
                'ingredients' => ['Carrots', 'Celery', 'Peanut butter'],
            ],

            // -----------------------------------------------------------
            // Cuisine library -- 8 per cuisine, researched against real
            // recipe sources rather than invented, so the ingredient
            // lists are ones an actual version of the dish would use
            // (simplified to what's in IngredientReferenceSeeder where a
            // real recipe would call for something more specific, e.g.
            // "Whole wheat pasta" standing in for spaghetti/fettuccine/
            // lasagna sheets). Tags mix cuisine + meal-type + diet, same
            // as the rest of this file.
            // -----------------------------------------------------------

            // Italian
            [
                'title' => 'Spaghetti Carbonara',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['italian', 'dinner', 'high-protein', 'quick'],
                'steps' => [
                    'Cook the pasta until al dente.',
                    'Fry the bacon until crisp.',
                    'Whisk eggs with grated Parmesan and black pepper.',
                    'Off the heat, toss the hot pasta with the bacon, then the egg mixture, until creamy.',
                ],
                'ingredients' => ['Whole wheat pasta', 'Bacon', 'Eggs', 'Parmesan', 'Black pepper'],
            ],
            [
                'title' => 'Fettuccine Alfredo',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 15,
                'difficulty' => 'Easy',
                'tags' => ['italian', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Cook the pasta until al dente.',
                    'Melt butter with milk in a pan over low heat.',
                    'Stir in Parmesan until a smooth sauce forms.',
                    'Toss with the pasta and black pepper.',
                ],
                'ingredients' => ['Whole wheat pasta', 'Butter', 'Parmesan', 'Milk', 'Black pepper'],
            ],
            [
                'title' => 'Margherita Flatbread',
                'image_key' => 'pizza-outline',
                'time_minutes' => 15,
                'difficulty' => 'Easy',
                'tags' => ['italian', 'lunch', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Warm the pita bread until lightly crisp.',
                    'Top with mozzarella and cherry tomatoes.',
                    'Warm through until the cheese melts, then finish with fresh basil and olive oil.',
                ],
                'ingredients' => ['Pita bread', 'Mozzarella', 'Cherry tomatoes', 'Basil', 'Olive oil'],
            ],
            [
                'title' => 'Chicken Parmesan',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 35,
                'difficulty' => 'Medium',
                'tags' => ['italian', 'dinner', 'high-protein'],
                'steps' => [
                    'Coat the chicken in egg, then breadcrumbs.',
                    'Pan-fry until golden and cooked through.',
                    'Top with pasta sauce and mozzarella, then broil until bubbly.',
                    'Serve with a sprinkle of Parmesan.',
                ],
                'ingredients' => ['Chicken', 'Breadcrumbs', 'Eggs', 'Pasta sauce', 'Mozzarella', 'Parmesan'],
            ],
            [
                'title' => 'Minestrone Soup',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 40,
                'difficulty' => 'Easy',
                'tags' => ['italian', 'lunch', 'dinner', 'vegetarian'],
                'steps' => [
                    'Sauté carrots, celery and onion until soft.',
                    'Add canned tomatoes, vegetable broth and kidney beans, simmer 15 minutes.',
                    'Add pasta and cook until tender.',
                ],
                'ingredients' => ['Carrots', 'Celery', 'Onion', 'Canned tomatoes', 'Kidney beans', 'Whole wheat pasta', 'Vegetable broth'],
            ],
            [
                'title' => 'Bruschetta',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 15,
                'difficulty' => 'Easy',
                'tags' => ['italian', 'snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Toast slices of bread.',
                    'Toss chopped cherry tomatoes with basil, garlic and olive oil.',
                    'Spoon over the toasted bread.',
                ],
                'ingredients' => ['Bread', 'Cherry tomatoes', 'Basil', 'Garlic', 'Olive oil'],
            ],
            [
                'title' => 'Mushroom Risotto',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 35,
                'difficulty' => 'Medium',
                'tags' => ['italian', 'dinner', 'vegetarian'],
                'steps' => [
                    'Sauté mushrooms, onion and garlic in butter.',
                    'Add rice and toast briefly, then add vegetable broth a ladle at a time, stirring until absorbed.',
                    'Finish with Parmesan and butter.',
                ],
                'ingredients' => ['White rice', 'Mushrooms', 'Onion', 'Garlic', 'Vegetable broth', 'Parmesan', 'Butter'],
            ],
            [
                'title' => 'Beef Lasagna',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 75,
                'difficulty' => 'Medium',
                'tags' => ['italian', 'dinner', 'high-protein', 'comfort-food'],
                'steps' => [
                    'Brown the ground beef and simmer with pasta sauce.',
                    'Layer pasta, meat sauce, ricotta and mozzarella in a dish, repeat.',
                    'Top with Parmesan and bake until golden and bubbling.',
                ],
                'ingredients' => ['Whole wheat pasta', 'Ground beef', 'Pasta sauce', 'Ricotta', 'Mozzarella', 'Parmesan'],
            ],

            // Mexican
            [
                'title' => 'Beef Tacos',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['mexican', 'lunch', 'dinner', 'quick'],
                'steps' => [
                    'Brown the ground beef with onion.',
                    'Warm the tortillas.',
                    'Fill with beef, lettuce, tomatoes and cheese.',
                ],
                'ingredients' => ['Ground beef', 'Tortillas', 'Lettuce', 'Tomatoes', 'Cheddar cheese', 'Onion'],
            ],
            [
                'title' => 'Chicken Enchiladas',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 40,
                'difficulty' => 'Medium',
                'tags' => ['mexican', 'dinner', 'high-protein'],
                'steps' => [
                    'Simmer chicken with onion, canned tomatoes and chili powder, then shred.',
                    'Roll the filling into tortillas and place in a baking dish.',
                    'Top with cheddar cheese and bake until melted.',
                ],
                'ingredients' => ['Chicken', 'Tortillas', 'Canned tomatoes', 'Cheddar cheese', 'Chili powder', 'Onion'],
            ],
            [
                'title' => 'Bean Burritos',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 15,
                'difficulty' => 'Easy',
                'tags' => ['mexican', 'lunch', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Warm the black beans and rice.',
                    'Fill the tortillas with beans, rice and cheese.',
                    'Top with salsa and roll up.',
                ],
                'ingredients' => ['Black beans', 'Tortillas', 'White rice', 'Cheddar cheese', 'Salsa'],
            ],
            [
                'title' => 'Guacamole',
                'image_key' => 'nutrition-outline',
                'time_minutes' => 10,
                'difficulty' => 'Easy',
                'tags' => ['mexican', 'snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Mash the avocado.',
                    'Mix in chopped onion, tomatoes and cilantro.',
                    'Season with lime juice.',
                ],
                'ingredients' => ['Avocado', 'Limes', 'Onion', 'Tomatoes', 'Cilantro'],
            ],
            [
                'title' => 'Chicken Quesadillas',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 15,
                'difficulty' => 'Easy',
                'tags' => ['mexican', 'lunch', 'snack', 'quick'],
                'steps' => [
                    'Sauté chicken with bell peppers and onion.',
                    'Fill a tortilla with the mixture and cheddar cheese, fold in half.',
                    'Cook in a pan until golden on both sides.',
                ],
                'ingredients' => ['Tortillas', 'Cheddar cheese', 'Chicken', 'Bell peppers', 'Onion'],
            ],
            [
                'title' => 'Chilaquiles',
                'image_key' => 'egg-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['mexican', 'breakfast', 'vegetarian'],
                'steps' => [
                    'Warm the salsa in a pan.',
                    'Toss in torn tortillas until coated and slightly softened.',
                    'Top with fried eggs, cheddar cheese and onion.',
                ],
                'ingredients' => ['Tortillas', 'Salsa', 'Eggs', 'Cheddar cheese', 'Onion'],
            ],
            [
                'title' => 'Mexican Rice',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['mexican', 'lunch', 'dinner', 'vegetarian'],
                'steps' => [
                    'Sauté rice with onion and garlic until lightly toasted.',
                    'Add canned tomatoes and cumin, then simmer covered until the rice is tender.',
                ],
                'ingredients' => ['White rice', 'Canned tomatoes', 'Onion', 'Garlic', 'Cumin'],
            ],
            [
                'title' => 'Mexican Street Corn Salad',
                'image_key' => 'leaf-outline',
                'time_minutes' => 15,
                'difficulty' => 'Easy',
                'tags' => ['mexican', 'snack', 'lunch', 'vegetarian', 'quick'],
                'steps' => [
                    'Char the corn in a hot pan.',
                    'Toss with mayonnaise, cheddar cheese and chili powder.',
                    'Finish with a squeeze of lime.',
                ],
                'ingredients' => ['Corn', 'Mayonnaise', 'Cheddar cheese', 'Chili powder', 'Limes'],
            ],

            // Asian
            [
                'title' => 'Kung Pao Chicken',
                'image_key' => 'flame-outline',
                'time_minutes' => 25,
                'difficulty' => 'Medium',
                'tags' => ['asian', 'dinner', 'high-protein'],
                'steps' => [
                    'Stir-fry chicken until golden.',
                    'Add bell peppers, garlic and green onion.',
                    'Toss with soy sauce and peanuts.',
                ],
                'ingredients' => ['Chicken', 'Peanuts', 'Bell peppers', 'Soy sauce', 'Garlic', 'Green onion'],
            ],
            [
                'title' => 'Shrimp Pad Thai',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['asian', 'dinner', 'quick'],
                'steps' => [
                    'Soak the noodles until soft.',
                    'Stir-fry shrimp, then push aside and scramble the eggs in the same pan.',
                    'Add the noodles, soy sauce and peanuts, toss together.',
                    'Finish with green onion and a squeeze of lime.',
                ],
                'ingredients' => ['Noodles', 'Shrimp', 'Eggs', 'Peanuts', 'Green onion', 'Soy sauce', 'Limes'],
            ],
            [
                'title' => 'Japchae',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['asian', 'dinner', 'vegetarian'],
                'steps' => [
                    'Cook the noodles and toss with sesame oil.',
                    'Stir-fry spinach, carrots and mushrooms separately.',
                    'Combine everything with soy sauce and toss well.',
                ],
                'ingredients' => ['Noodles', 'Spinach', 'Carrots', 'Mushrooms', 'Soy sauce', 'Sesame oil'],
            ],
            [
                'title' => 'Vegetable Fried Rice',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['asian', 'lunch', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Scramble the eggs in a hot pan, set aside.',
                    'Stir-fry carrots and bell peppers, then add the rice.',
                    'Toss with soy sauce, green onion and the eggs.',
                ],
                'ingredients' => ['White rice', 'Eggs', 'Carrots', 'Green onion', 'Soy sauce', 'Bell peppers'],
            ],
            [
                'title' => 'Teriyaki Chicken',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['asian', 'dinner', 'high-protein'],
                'steps' => [
                    'Pan-sear the chicken until cooked through.',
                    'Simmer soy sauce, honey, garlic and ginger into a glaze.',
                    'Toss the chicken in the glaze and serve over rice.',
                ],
                'ingredients' => ['Chicken', 'Soy sauce', 'Honey', 'Garlic', 'Ginger', 'White rice'],
            ],
            [
                'title' => 'Beef and Broccoli',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['asian', 'dinner', 'high-protein'],
                'steps' => [
                    'Stir-fry sliced beef until browned.',
                    'Add broccoli and garlic, stir-fry until just tender.',
                    'Toss with soy sauce and serve over rice.',
                ],
                'ingredients' => ['Beef', 'Broccoli', 'Soy sauce', 'Garlic', 'White rice'],
            ],
            [
                'title' => 'Egg Drop Soup',
                'image_key' => 'egg-outline',
                'time_minutes' => 15,
                'difficulty' => 'Easy',
                'tags' => ['asian', 'lunch', 'dinner', 'quick'],
                'steps' => [
                    'Bring the chicken broth to a simmer with corn.',
                    'Drizzle in beaten eggs while stirring gently to form ribbons.',
                    'Finish with green onion.',
                ],
                'ingredients' => ['Chicken broth', 'Eggs', 'Corn', 'Green onion'],
            ],
            [
                'title' => 'Kimchi Fried Rice',
                'image_key' => 'flame-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['asian', 'lunch', 'dinner', 'quick'],
                'steps' => [
                    'Stir-fry kimchi until fragrant.',
                    'Add rice and toss until heated through.',
                    'Top with a fried egg and green onion, finish with sesame oil.',
                ],
                'ingredients' => ['White rice', 'Kimchi', 'Eggs', 'Green onion', 'Sesame oil'],
            ],

            // Mediterranean
            [
                'title' => 'Classic Hummus',
                'image_key' => 'nutrition-outline',
                'time_minutes' => 10,
                'difficulty' => 'Easy',
                'tags' => ['mediterranean', 'snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Blend chickpeas, tahini, garlic and lemon juice until smooth.',
                    'Drizzle with olive oil to serve.',
                ],
                'ingredients' => ['Chickpeas', 'Tahini', 'Garlic', 'Lemons', 'Olive oil'],
            ],
            [
                'title' => 'Falafel Wrap',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['mediterranean', 'lunch', 'vegetarian'],
                'steps' => [
                    'Blend chickpeas with garlic and spices, form into patties and pan-fry.',
                    'Warm the pita bread.',
                    'Fill with falafel, lettuce, tomatoes and a tahini drizzle.',
                ],
                'ingredients' => ['Chickpeas', 'Pita bread', 'Lettuce', 'Tomatoes', 'Tahini', 'Garlic'],
            ],
            [
                'title' => 'Greek Salad',
                'image_key' => 'leaf-outline',
                'time_minutes' => 10,
                'difficulty' => 'Easy',
                'tags' => ['mediterranean', 'lunch', 'vegetarian', 'quick'],
                'steps' => [
                    'Chop cucumber, tomatoes and red onion.',
                    'Toss with feta cheese and olive oil.',
                ],
                'ingredients' => ['Cucumber', 'Tomatoes', 'Feta cheese', 'Red onion', 'Olive oil'],
            ],
            [
                'title' => 'Tabbouleh',
                'image_key' => 'leaf-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['mediterranean', 'lunch', 'vegetarian', 'quick'],
                'steps' => [
                    'Cook the couscous and let it cool.',
                    'Toss with chopped parsley, tomatoes and cucumber.',
                    'Dress with lemon juice and olive oil.',
                ],
                'ingredients' => ['Couscous', 'Parsley', 'Tomatoes', 'Cucumber', 'Lemons', 'Olive oil'],
            ],
            [
                'title' => 'Greek Chicken Souvlaki',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['mediterranean', 'dinner', 'high-protein'],
                'steps' => [
                    'Marinate chicken chunks in lemon, garlic and olive oil.',
                    'Skewer and grill or pan-sear until cooked through.',
                    'Serve with warm pita bread.',
                ],
                'ingredients' => ['Chicken', 'Lemons', 'Garlic', 'Olive oil', 'Pita bread'],
            ],
            [
                'title' => 'Shakshuka',
                'image_key' => 'egg-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['mediterranean', 'breakfast', 'lunch', 'vegetarian'],
                'steps' => [
                    'Sauté bell peppers and onion with garlic.',
                    'Add canned tomatoes and simmer until thickened.',
                    'Crack in the eggs and cook until just set, then top with feta cheese.',
                ],
                'ingredients' => ['Eggs', 'Canned tomatoes', 'Bell peppers', 'Onion', 'Garlic', 'Feta cheese'],
            ],
            [
                'title' => 'Lemon Herb Quinoa Bowl',
                'image_key' => 'leaf-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['mediterranean', 'lunch', 'vegetarian', 'quick'],
                'steps' => [
                    'Cook the quinoa and let it cool slightly.',
                    'Toss with cherry tomatoes, cucumber and feta cheese.',
                    'Dress with olive oil and lemon juice.',
                ],
                'ingredients' => ['Quinoa', 'Cherry tomatoes', 'Cucumber', 'Feta cheese', 'Olive oil', 'Lemons'],
            ],
            [
                'title' => 'Mediterranean Chickpea Stew',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 30,
                'difficulty' => 'Easy',
                'tags' => ['mediterranean', 'dinner', 'vegetarian'],
                'steps' => [
                    'Sauté onion and garlic until soft.',
                    'Add chickpeas, canned tomatoes and cumin, simmer 15 minutes.',
                    'Stir in spinach until wilted.',
                ],
                'ingredients' => ['Chickpeas', 'Canned tomatoes', 'Onion', 'Garlic', 'Cumin', 'Spinach'],
            ],

            // American / Comfort Food
            [
                'title' => 'Classic Mac and Cheese',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['american', 'dinner', 'vegetarian', 'comfort-food'],
                'steps' => [
                    'Cook the pasta until al dente.',
                    'Make a sauce with butter, flour and milk, then melt in the cheddar cheese.',
                    'Toss with the pasta.',
                ],
                'ingredients' => ['Whole wheat pasta', 'Cheddar cheese', 'Milk', 'Butter', 'Flour'],
            ],
            [
                'title' => 'Classic Beef Meatloaf',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 70,
                'difficulty' => 'Medium',
                'tags' => ['american', 'dinner', 'high-protein', 'comfort-food'],
                'steps' => [
                    'Mix ground beef with breadcrumbs, eggs and chopped onion.',
                    'Shape into a loaf and top with ketchup.',
                    'Bake until cooked through.',
                ],
                'ingredients' => ['Ground beef', 'Breadcrumbs', 'Eggs', 'Onion', 'Ketchup'],
            ],
            [
                'title' => 'Crispy Fried Chicken',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 40,
                'difficulty' => 'Medium',
                'tags' => ['american', 'dinner', 'high-protein', 'comfort-food'],
                'steps' => [
                    'Dip chicken pieces in milk, then seasoned flour.',
                    'Fry until golden and cooked through.',
                ],
                'ingredients' => ['Chicken', 'Flour', 'Milk', 'Eggs', 'Black pepper'],
            ],
            [
                'title' => 'Classic Cheeseburger',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 20,
                'difficulty' => 'Easy',
                'tags' => ['american', 'lunch', 'dinner', 'quick'],
                'steps' => [
                    'Form and grill the beef patties.',
                    'Top with cheddar cheese to melt.',
                    'Build the burger with buns, lettuce, tomatoes and ketchup.',
                ],
                'ingredients' => ['Ground beef', 'Buns', 'Cheddar cheese', 'Lettuce', 'Tomatoes', 'Ketchup'],
            ],
            [
                'title' => 'Loaded Baked Potato',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 50,
                'difficulty' => 'Easy',
                'tags' => ['american', 'dinner', 'comfort-food'],
                'steps' => [
                    'Bake the potatoes until tender.',
                    'Split open and top with cheddar cheese, sour cream, bacon and green onion.',
                ],
                'ingredients' => ['Potatoes', 'Cheddar cheese', 'Sour cream', 'Bacon', 'Green onion'],
            ],
            [
                'title' => 'Chicken Pot Pie',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 55,
                'difficulty' => 'Medium',
                'tags' => ['american', 'dinner', 'comfort-food'],
                'steps' => [
                    'Cook chicken, carrots, potatoes and green beans in a creamy sauce made with flour and chicken broth.',
                    'Top with a pastry or biscuit crust and bake until golden.',
                ],
                'ingredients' => ['Chicken', 'Carrots', 'Potatoes', 'Green beans', 'Flour', 'Chicken broth'],
            ],
            [
                'title' => 'Grilled Cheese Sandwich',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 10,
                'difficulty' => 'Easy',
                'tags' => ['american', 'lunch', 'snack', 'vegetarian', 'quick'],
                'steps' => [
                    'Butter the outside of two slices of bread.',
                    'Fill with cheddar cheese and grill on both sides until golden and melted.',
                ],
                'ingredients' => ['Bread', 'Cheddar cheese', 'Butter'],
            ],
            [
                'title' => 'Classic Cornbread',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 35,
                'difficulty' => 'Easy',
                'tags' => ['american', 'snack', 'dinner', 'vegetarian'],
                'steps' => [
                    'Mix cornmeal, flour, milk, eggs and melted butter into a batter.',
                    'Pour into a pan and bake until golden.',
                    'Serve warm with a drizzle of honey.',
                ],
                'ingredients' => ['Cornmeal', 'Flour', 'Milk', 'Eggs', 'Butter', 'Honey'],
            ],

            // Romanian
            [
                'title' => 'Sarmale (Stuffed Cabbage Rolls)',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 120,
                'difficulty' => 'Hard',
                'tags' => ['romanian', 'dinner', 'comfort-food'],
                'steps' => [
                    'Mix ground beef and pork with rice and chopped onion.',
                    'Wrap spoonfuls in cabbage leaves.',
                    'Simmer slowly for about 2 hours until tender.',
                    'Serve with a dollop of sour cream.',
                ],
                'ingredients' => ['Cabbage', 'Ground beef', 'Pork', 'White rice', 'Onion', 'Sour cream'],
            ],
            [
                'title' => 'Mici (Grilled Meat Rolls)',
                'image_key' => 'flame-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['romanian', 'dinner', 'high-protein'],
                'steps' => [
                    'Mix ground beef and pork with garlic, baking soda and black pepper.',
                    'Rest the mixture, then shape into small skinless sausages.',
                    'Grill until charred and cooked through.',
                ],
                'ingredients' => ['Ground beef', 'Pork', 'Garlic', 'Baking soda', 'Black pepper'],
            ],
            [
                'title' => 'Mămăligă (Romanian Polenta)',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 25,
                'difficulty' => 'Easy',
                'tags' => ['romanian', 'lunch', 'dinner', 'vegetarian', 'quick'],
                'steps' => [
                    'Whisk cornmeal into boiling water with a pinch of salt.',
                    'Stir continuously until thick and creamy.',
                    'Finish with butter and serve with sour cream.',
                ],
                'ingredients' => ['Cornmeal', 'Butter', 'Sour cream'],
            ],
            [
                'title' => 'Ciorbă de Legume (Romanian Vegetable Soup)',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 40,
                'difficulty' => 'Easy',
                'tags' => ['romanian', 'lunch', 'dinner', 'vegetarian'],
                'steps' => [
                    'Sauté carrots, celery and onion.',
                    'Add potatoes and vegetable broth, simmer until tender.',
                    'Finish with a swirl of sour cream.',
                ],
                'ingredients' => ['Carrots', 'Celery', 'Potatoes', 'Onion', 'Vegetable broth', 'Sour cream'],
            ],
            [
                'title' => 'Zacuscă-Style Vegetable Spread',
                'image_key' => 'nutrition-outline',
                'time_minutes' => 45,
                'difficulty' => 'Medium',
                'tags' => ['romanian', 'snack', 'vegetarian'],
                'steps' => [
                    'Roast the eggplant and bell peppers until soft.',
                    'Sauté onion, then combine everything with canned tomatoes and vegetable oil.',
                    'Simmer until thick, spreadable and well blended.',
                ],
                'ingredients' => ['Eggplant', 'Bell peppers', 'Onion', 'Canned tomatoes', 'Vegetable oil'],
            ],
            [
                'title' => 'Ciorbă de Perișoare (Romanian Meatball Soup)',
                'image_key' => 'restaurant-outline',
                'time_minutes' => 45,
                'difficulty' => 'Medium',
                'tags' => ['romanian', 'lunch', 'dinner'],
                'steps' => [
                    'Mix ground beef with rice and shape into small meatballs.',
                    'Simmer carrots, celery and onion in vegetable broth.',
                    'Add the meatballs and cook until tender.',
                ],
                'ingredients' => ['Ground beef', 'White rice', 'Carrots', 'Celery', 'Onion', 'Vegetable broth'],
            ],
            [
                'title' => 'Papanași (Fried Cheese Doughnuts)',
                'image_key' => 'ice-cream-outline',
                'time_minutes' => 30,
                'difficulty' => 'Medium',
                'tags' => ['romanian', 'snack', 'vegetarian'],
                'steps' => [
                    'Mix cottage cheese with flour and eggs into a soft dough.',
                    'Shape into rounds and fry until golden.',
                    'Top with sour cream and jam.',
                ],
                'ingredients' => ['Cottage cheese', 'Flour', 'Eggs', 'Sour cream', 'Jam'],
            ],
            [
                'title' => 'Salată de Vinete (Romanian Eggplant Salad)',
                'image_key' => 'leaf-outline',
                'time_minutes' => 40,
                'difficulty' => 'Easy',
                'tags' => ['romanian', 'snack', 'lunch', 'vegetarian'],
                'steps' => [
                    'Roast the eggplant until the skin blackens and the flesh is soft.',
                    'Scoop out the flesh and finely chop.',
                    'Mix with mayonnaise, onion and garlic.',
                ],
                'ingredients' => ['Eggplant', 'Mayonnaise', 'Onion', 'Garlic'],
            ],
        ];

        foreach ($recipes as $data) {
            $ingredients = $data['ingredients'];
            unset($data['ingredients']);

            $recipe = Recipe::updateOrCreate(
                ['title' => $data['title'], 'user_id' => null],
                $data,
            );

            $recipe->ingredients()->delete();
            foreach (array_values($ingredients) as $index => $name) {
                $recipe->ingredients()->create(['name' => $name, 'sort_order' => $index]);
            }
        }
    }
}
