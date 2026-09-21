<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\IngredientReference;

class IngredientReferenceController extends Controller
{
    // GET /api/ingredient-references -- the whole dictionary, ~100 rows.
    // Meant to be fetched once and cached client-side (see
    // lib/spaces/grocery/ingredientLookup.ts), not re-queried per
    // keystroke while typing in Add Product.
    public function index()
    {
        return response()->json(
            IngredientReference::orderBy('category')->orderBy('name')->get(),
        );
    }
}
