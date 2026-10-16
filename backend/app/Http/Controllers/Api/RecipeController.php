<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RecipeController extends Controller
{
    private function ingredientRules(): array
    {
        return [
            'ingredients'             => 'nullable|array',
            'ingredients.*.name'      => 'required_with:ingredients|string|max:150',
            'ingredients.*.quantity'  => 'nullable|string|max:50',
        ];
    }

    // GET /api/recipes -- the library (user_id is null) plus this user's
    // own personal recipes, never anyone else's. ?tag= and ?search=
    // narrow it further, matching the Recipes screen's filter pills and
    // search box.
    public function index(Request $request)
    {
        $query = Recipe::with('ingredients')
            ->where(function ($q) use ($request) {
                $q->whereNull('user_id')->orWhere('user_id', $request->user()->id);
            });

        if ($request->filled('tag')) {
            $query->whereJsonContains('tags', $request->input('tag'));
        }

        if ($request->filled('search')) {
            $term = $request->input('search');
            $query->where(function ($q) use ($term) {
                $q->where('title', 'like', "%{$term}%")
                    ->orWhereHas('ingredients', function ($iq) use ($term) {
                        $iq->where('name', 'like', "%{$term}%");
                    });
            });
        }

        return response()->json($query->latest()->get());
    }

    // POST /api/recipes -- always creates a personal recipe (user_id =
    // the authenticated user); library recipes are seeded, not created
    // through this endpoint.
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), array_merge([
            'title'         => 'required|string|max:255',
            'image_key'     => 'nullable|string|max:100',
            'time_minutes'  => 'nullable|integer|min:0',
            'difficulty'    => 'nullable|string|max:20',
            'steps'         => 'nullable|array',
            'steps.*'       => 'string',
            'tags'          => 'nullable|array',
            'tags.*'        => 'string|max:30',
        ], $this->ingredientRules()));

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $data = $validator->validated();
        $ingredients = $data['ingredients'] ?? [];
        unset($data['ingredients']);

        $data['user_id'] = $request->user()->id;

        $recipe = Recipe::create($data);
        $this->syncIngredients($recipe, $ingredients);

        return response()->json($recipe->load('ingredients'), 201);
    }

    // GET /api/recipes/{id} -- library or the user's own, same
    // visibility rule as index().
    public function show(Request $request, $id)
    {
        $recipe = $this->visibleTo($request)->with('ingredients')->find($id);

        if (!$recipe) {
            return response()->json(['message' => 'Rețeta nu a fost găsită.'], 404);
        }

        return response()->json($recipe);
    }

    // PUT /api/recipes/{id} -- only the user's own personal recipes;
    // library recipes (user_id null) are read-only from this API.
    public function update(Request $request, $id)
    {
        $recipe = Recipe::where('id', $id)->where('user_id', $request->user()->id)->first();

        if (!$recipe) {
            return response()->json(['message' => 'Rețeta nu a fost găsită sau nu poate fi modificată.'], 404);
        }

        $validator = Validator::make($request->all(), array_merge([
            'title'         => 'sometimes|required|string|max:255',
            'image_key'     => 'nullable|string|max:100',
            'time_minutes'  => 'nullable|integer|min:0',
            'difficulty'    => 'nullable|string|max:20',
            'steps'         => 'nullable|array',
            'steps.*'       => 'string',
            'tags'          => 'nullable|array',
            'tags.*'        => 'string|max:30',
        ], $this->ingredientRules()));

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
        }

        $data = $validator->validated();

        if (array_key_exists('ingredients', $data)) {
            $this->syncIngredients($recipe, $data['ingredients'] ?? []);
            unset($data['ingredients']);
        }

        $recipe->update($data);

        return response()->json($recipe->load('ingredients'));
    }

    // DELETE /api/recipes/{id} -- only the user's own, same restriction
    // as update().
    public function destroy(Request $request, $id)
    {
        $recipe = Recipe::where('id', $id)->where('user_id', $request->user()->id)->first();

        if (!$recipe) {
            return response()->json(['message' => 'Rețeta nu a fost găsită sau nu poate fi ștearsă.'], 404);
        }

        $recipe->delete();

        return response()->json(['message' => 'Rețeta a fost ștearsă.']);
    }

    private function visibleTo(Request $request)
    {
        return Recipe::where(function ($q) use ($request) {
            $q->whereNull('user_id')->orWhere('user_id', $request->user()->id);
        });
    }

    /** Replaces this recipe's ingredient rows wholesale -- simplest
     * correct way to handle reordering/removal on edit, since the form
     * always sends the full current list, not a diff. */
    private function syncIngredients(Recipe $recipe, array $ingredients): void
    {
        $recipe->ingredients()->delete();

        foreach (array_values($ingredients) as $index => $ingredient) {
            $recipe->ingredients()->create([
                'name' => $ingredient['name'],
                'quantity' => $ingredient['quantity'] ?? null,
                'sort_order' => $index,
            ]);
        }
    }
}
