<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Space;

class SpaceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $spaces = $request->user()
            ->spaces()
            ->with(['carProfile', 'homeProfile'])
            ->latest()
            ->get();

        return response()->json([
            'spaces' => $spaces,
        ]);
    }
    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request) {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'icon' => ['nullable', 'string', 'max:50'],
            'color' => ['nullable', 'string', 'max:20'],
        ]);
        $space = $request->user()->spaces()->create($validated);
        return response()->json([
            'message' => 'Space created successfully.',
            'space' => $space,
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, string $id) {
        $space = $request->user()
            ->spaces()
            ->with(['carProfile', 'homeProfile'])
            ->findOrFail($id);
        return response()->json([
            'space' => $space,
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id) {
        $space = $request->user()
            ->spaces()
            ->findOrFail($id);
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:50'],
            'color' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);
        $space->update($validated);
        return response()->json([
            'message' => 'Space updated successfully.',
            'space' => $space->fresh(),
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, string $id) {
        $space = $request->user()
            ->spaces()
            ->findOrFail($id);
        $space->delete();
        return response()->json([
            'message' => 'Space deleted successfully.',
        ]);
    }

    /**
     * Create or replace the Car-specific profile (Make/Model/Color/Year/
     * Purchase price/Tank capacity) for a space the user owns. One
     * profile per space -- updateOrCreate keyed on space_id.
     */
    public function updateCarProfile(Request $request, string $id) {
        $space = $request->user()
            ->spaces()
            ->findOrFail($id);

        $validated = $request->validate([
            'make' => ['required', 'string', 'max:100'],
            'model' => ['required', 'string', 'max:100'],
            'color' => ['nullable', 'string', 'max:50'],
            'year' => ['required', 'integer', 'min:1900', 'max:2100'],
            'purchase_price' => ['required', 'numeric', 'min:0'],
            'tank_capacity' => ['required', 'numeric', 'gt:0'],
        ]);

        $profile = $space->carProfile()->updateOrCreate(
            ['space_id' => $space->id],
            $validated,
        );

        return response()->json([
            'message' => 'Car profile saved successfully.',
            'profile' => $profile,
        ]);
    }

    /**
     * Create or replace the Home-specific profile (County/City/Ownership/
     * Purchase price) for a space the user owns. One profile per space --
     * updateOrCreate keyed on space_id.
     */
    public function updateHomeProfile(Request $request, string $id) {
        $space = $request->user()
            ->spaces()
            ->findOrFail($id);

        $validated = $request->validate([
            'county' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'ownership' => ['required', 'string', 'in:bought,inherited'],
            'purchase_price' => ['nullable', 'numeric', 'min:0'],
        ]);

        $profile = $space->homeProfile()->updateOrCreate(
            ['space_id' => $space->id],
            $validated,
        );

        return response()->json([
            'message' => 'Home profile saved successfully.',
            'profile' => $profile,
        ]);
    }
}
