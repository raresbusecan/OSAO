<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use App\Support\ItemBudgetRules;
use App\Support\SpaceProfileRules;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;

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
            // Optional, car/home only: the Car/Home profile, same shape and
            // rules as PUT /spaces/{id}/car-profile|home-profile
            // (App\Support\SpaceProfileRules), so creating a car/home is ONE
            // request -- a failed profile used to leave a profile-less space
            // behind (and a retry duplicated it).
            'profile' => ['sometimes', 'nullable', 'array'],
            // Optional, car/home only: the space was bought "în rate". Its
            // monthly rate becomes an expense_credit in the user's
            // Cheltuieli space (see createLinkedCredit below).
            'credit' => ['sometimes', 'nullable', 'array'],
            'credit.title' => ['required_with:credit', 'string', 'max:255'],
            'credit.amount' => ['required_with:credit'],
            'credit.day_of_month' => ['required_with:credit'],
            'credit.end_date' => ['required_with:credit'],
        ], [
            'credit.title.required_with' => 'Scrie un nume pentru credit.',
            'credit.title.max' => 'Numele creditului e prea lung.',
            'credit.amount.required_with' => 'Rata lunară trebuie să fie mai mare decât 0.',
            'credit.day_of_month.required_with' => 'Ziua de plată trebuie să fie între 1 și 31.',
            'credit.end_date.required_with' => 'Data ultimei rate este obligatorie (AAAA-LL-ZZ).',
        ]);
        $credit = !empty($validated['credit']) ? $validated['credit'] : null;
        $profileInput = array_key_exists('profile', $validated) && $validated['profile'] !== null ? $validated['profile'] : null;
        unset($validated['credit'], $validated['profile']);
        $kind = $validated['type'] ?? null;

        // Everything that can be checked without writing is checked first.
        $profile = null;
        if ($profileInput !== null) {
            $rules = SpaceProfileRules::for($kind);
            if ($rules === null) {
                return $this->creditError(['profile' => ['Doar o mașină sau o casă are profil.']]);
            }
            $v = Validator::make($profileInput, $rules, SpaceProfileRules::messages());
            if ($v->fails()) {
                $errors = [];
                foreach ($v->errors()->toArray() as $field => $messages) {
                    $errors['profile.' . $field] = $messages;
                }
                return $this->creditError($errors);
            }
            $profile = $v->validated();
        }
        if ($credit !== null) {
            if (!in_array($kind, ['car', 'home'], true)) {
                return $this->creditError(['credit' => ['Doar o mașină sau o casă poate fi cumpărată în rate.']]);
            }
            if (trim((string) $credit['title']) === '') {
                return $this->creditError(['credit.title' => ['Scrie un nume pentru credit.']]);
            }
        }

        // One transaction: the space, its profile, the Cheltuieli space
        // (reused or a new "Default") and the credit land together or not
        // at all.
        $result = null;
        DB::beginTransaction();
        try {
            $space = $request->user()->spaces()->create($validated);
            if ($profile !== null) {
                $relation = $kind === 'car' ? $space->carProfile() : $space->homeProfile();
                $relation->create($profile);
            }
            if ($credit !== null) {
                $result = $this->createLinkedCredit($request->user(), $space, $credit);
                if (isset($result['errors'])) {
                    DB::rollBack();
                    return $this->creditError($result['errors']);
                }
            }
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        $space->load(['carProfile', 'homeProfile']);
        $space->is_owner = true;
        $body = [
            'message' => 'Space created successfully.',
            'space' => $space,
        ];
        if ($profile !== null) {
            $body['profile'] = $kind === 'car' ? $space->carProfile : $space->homeProfile;
        }
        if ($result !== null) {
            $result['expenses_space']->is_owner = true;
            $body['credit'] = $result['credit'];
            $body['expenses_space'] = $result['expenses_space'];
            $body['expenses_space_created'] = $result['expenses_space_created'];
        }
        return response()->json($body, 201);
    }

    /** The user's first Cheltuieli space in grid order (same ORDER BY as
     * index()), or a new one named "Default" -- created like the Spaces
     * tab's Cheltuieli template (receipt icon, teal). Only `type =
     * 'expenses'` counts: a legacy untyped space can't be told apart
     * server-side (the frontend guesses from name/icon), so it's never
     * picked. Then the expense_credit, linked to $space, through the same
     * rules as POST /items (App\Support\ItemBudgetRules). Returns
     * ['errors' => [...]] (keys prefixed `credit.`) on a rule violation --
     * the caller rolls back. */
    private function createLinkedCredit(User $user, Space $space, array $credit): array
    {
        $expenses = $user->spaces()
            ->where('type', 'expenses')
            ->orderByRaw('sort_order IS NULL')
            ->orderBy('sort_order')
            ->latest()
            ->first();
        $created = false;
        if (!$expenses) {
            $expenses = $user->spaces()->create([
                'name' => 'Default',
                'icon' => 'receipt-outline',
                'color' => '#14B8A6',
                'type' => 'expenses',
            ]);
            $created = true;
        }

        $data = [
            'type' => Item::CREDIT_TYPE,
            'space_id' => $expenses->id,
            'title' => trim((string) $credit['title']),
            'amount' => $credit['amount'],
            'metadata' => [
                'day_of_month' => $credit['day_of_month'],
                'end_date' => $credit['end_date'],
                'linked_space_id' => $space->id,
            ],
        ];
        $errors = ItemBudgetRules::errors($user, $data, null);
        if ($errors) {
            $prefixed = [];
            foreach ($errors as $field => $messages) {
                $prefixed['credit.' . preg_replace('/^metadata\./', '', $field)] = $messages;
            }
            return ['errors' => $prefixed];
        }

        $data['user_id'] = $user->id;
        $item = Item::create($data);

        return [
            'credit' => $item,
            'expenses_space' => $expenses,
            'expenses_space_created' => $created,
        ];
    }

    /** Romanian 422 in the shape lib/api.ts reads (`message` = first error). */
    private function creditError(array $errors)
    {
        return response()->json(['message' => array_values($errors)[0][0], 'errors' => $errors], 422);
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

        $validated = $request->validate(SpaceProfileRules::car(), SpaceProfileRules::messages());

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

        $validated = $request->validate(SpaceProfileRules::home(), SpaceProfileRules::messages());

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
