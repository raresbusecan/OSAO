<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Space;
use App\Models\User;

class SpaceController extends Controller
{
    /**
     * Display a listing of the resource -- owned spaces plus anything
     * shared with this user (see Space::scopeAccessibleBy). Each space
     * carries `is_owner` so the frontend can tell the two apart (only an
     * owner can rename/delete a space or manage its members).
     */
    public function index(Request $request)
    {
        // A statement body, not an arrow-fn expression -- Collection::each()
        // stops iterating the moment a callback returns exactly `false`,
        // and `fn ($s) => $s->is_owner = ...` returns the assignment's own
        // value, silently truncating the list right after the first
        // not-owned space.
        // Manually-ordered spaces (sort_order set via reorder() below) come
        // first, in that order; anything never dragged falls back to the
        // pre-existing newest-first behavior -- MySQL sorts NULL before 0 in
        // ASC order, so `sort_order IS NULL` (0/1) has to lead the ORDER BY
        // to push the untouched spaces after the manually-ordered ones
        // instead of before them.
        $spaces = Space::accessibleBy($request->user())
            ->with(['carProfile', 'homeProfile'])
            ->orderByRaw('sort_order IS NULL')
            ->orderBy('sort_order')
            ->latest()
            ->get()
            ->each(function (Space $space) use ($request) {
                $space->is_owner = $space->user_id === $request->user()->id;
            });

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
            // Set once, here, and never accepted by update() below --
            // deliberately not editable, so renaming a space (or changing
            // its icon) can never change what kind of space it is. See
            // spaceProfile.ts's detectSpaceType.
            'type' => ['nullable', 'string', 'max:50'],
        ]);
        $space = $request->user()->spaces()->create($validated);
        $space->is_owner = true;
        return response()->json([
            'message' => 'Space created successfully.',
            'space' => $space,
        ], 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, string $id) {
        $space = Space::accessibleBy($request->user())
            ->with(['carProfile', 'homeProfile'])
            ->findOrFail($id);
        $space->is_owner = $space->user_id === $request->user()->id;
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
     * Persists the drag-to-reorder result from the Spaces tab's card grid.
     * `order` is the full list of space ids in their new display order --
     * anything in it that isn't actually accessibleBy this user is silently
     * dropped rather than erroring the whole request (a stale client-side
     * list -- e.g. a space someone else just removed them from -- shouldn't
     * block reordering the rest). Ids the user can see but that were left
     * OUT of `order` keep whatever sort_order they already had; the
     * frontend always sends its full visible list, so in practice this
     * only matters if a client sends a partial one.
     */
    public function reorder(Request $request) {
        $validated = $request->validate([
            'order' => ['required', 'array', 'min:1'],
            'order.*' => ['integer'],
        ]);

        $accessibleIds = Space::accessibleBy($request->user())
            ->whereIn('id', $validated['order'])
            ->pluck('id')
            ->all();
        $accessibleIds = array_flip($accessibleIds);

        $position = 0;
        foreach ($validated['order'] as $id) {
            if (!isset($accessibleIds[$id])) {
                continue;
            }
            Space::where('id', $id)->update(['sort_order' => $position]);
            $position++;
        }

        return response()->json(['message' => 'Order updated.']);
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

    /**
     * List who can use this space -- the owner plus every member. Either
     * one can call this (accessibleBy, not owner-only) since anyone
     * inside a shared space should be able to see who else is in it.
     */
    public function members(Request $request, string $id)
    {
        $space = Space::accessibleBy($request->user())->findOrFail($id);

        return response()->json([
            'owner' => $space->user()->select('id', 'name', 'email')->first(),
            'members' => $space->members()->select('users.id', 'users.name', 'users.email')->get(),
        ]);
    }

    /**
     * Add an existing user (by email) to this space -- owner-only, same
     * as update()/destroy() above. There's no invite/notification system
     * yet, so this only works for someone who already has an account;
     * anything else is a plain 404 rather than a silent no-op.
     */
    public function addMember(Request $request, string $id)
    {
        $space = $request->user()->spaces()->findOrFail($id);

        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user) {
            return response()->json([
                'message' => 'Nu există niciun cont cu acest email.',
            ], 404);
        }

        if ($user->id === $space->user_id) {
            return response()->json([
                'message' => 'Este deja proprietarul acestui space.',
            ], 422);
        }

        $space->members()->syncWithoutDetaching([$user->id]);

        return response()->json([
            'message' => 'Membru adăugat cu succes.',
            'member' => $user->only(['id', 'name', 'email']),
        ], 201);
    }

    /**
     * Remove a member -- owner-only. Detaching someone who was never a
     * member (or removing twice) is a harmless no-op, not an error.
     */
    public function removeMember(Request $request, string $id, string $userId)
    {
        $space = $request->user()->spaces()->findOrFail($id);
        $space->members()->detach($userId);

        return response()->json([
            'message' => 'Membru eliminat cu succes.',
        ]);
    }
}
