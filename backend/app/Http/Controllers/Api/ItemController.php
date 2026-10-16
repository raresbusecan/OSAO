<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use App\Support\ItemBudgetRules;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    /** The space an item's `space_id` points at, if the current user is
     * allowed into it (owner or space-level member -- see
     * Space::scopeAccessibleBy). Null if the id doesn't resolve or
     * isn't accessible. Used for the space-level gate on every item
     * TYPE EXCEPT grocery_list/grocery_item, which have their own,
     * narrower rule (see canAccessList) that never depends on this. */
    private function accessibleSpace(Request $request, $spaceId): ?Space
    {
        return Space::accessibleBy($request->user())->find($spaceId);
    }

    /** Whether the user can see/use one specific grocery list -- the
     * owner of its OWN space always can (every list in their own
     * space); anyone else needs their own row in that list's `members`
     * (see Item::members / list_members). Deliberately independent of
     * Space::accessibleBy / space_members: a list share is about that
     * one list, full stop -- it never depends on, and never grants,
     * any broader relationship to the space it happens to live in. */
    private function canAccessList(Request $request, Item $list): bool
    {
        if (!$list->space_id) {
            return $list->user_id === $request->user()->id;
        }

        $space = $list->space ?? Space::find($list->space_id);
        if (!$space) return false;

        if ($space->user_id === $request->user()->id) return true;

        return $list->members()->where('users.id', $request->user()->id)->exists();
    }

    /** Whether the current user may see/edit this specific item. A
     * grocery_list item defers to canAccessList; a grocery_item item
     * defers to whether its PARENT list is accessible (resolved via
     * metadata.listId), not its own creator -- that's the whole point
     * of a list being shared, any member can touch any item on it.
     * Every other type keeps the plain space-level rule (space owner or
     * any space member); an item with no space at all is private to
     * whoever created it. */
    private function canAccessItem(Request $request, Item $item): bool
    {
        if ($item->type === 'grocery_list') {
            return $this->canAccessList($request, $item);
        }

        if ($item->type === 'grocery_item') {
            $listId = $item->metadata['listId'] ?? null;
            $list = $listId ? Item::find($listId) : null;
            if ($list) return $this->canAccessList($request, $list);
            // The list itself couldn't be resolved (shouldn't normally
            // happen) -- fall through to the plain space-level check
            // below rather than hard-denying.
        }

        if ($item->space_id) {
            return Space::accessibleBy($request->user())->where('id', $item->space_id)->exists();
        }

        return $item->user_id === $request->user()->id;
    }

    /** Whether the current user may rename/delete this specific list --
     * the space owner (always), or whoever created it. Anyone else with
     * access to the list (via list_members) can still use its items,
     * just not touch the list row itself. */
    private function canManageList(Request $request, Item $list): bool
    {
        $isSpaceOwner = $list->space && $list->space->user_id === $request->user()->id;
        $isCreator = $list->user_id === $request->user()->id;

        return $isSpaceOwner || $isCreator;
    }

    /** Every grocery_list this user can see FOR ONE SPECIFIC Grocery
     * space -- that space's own lists, plus any list (in ANYONE's space)
     * they've been individually added to. This is the one query the
     * "mine" grocery endpoints below both build on: a list's space never
     * changes when it's shared (see myGrocery/store's docs) -- only
     * which lists you can see does.
     *
     * $spaceId scopes the "my own lists" half deliberately -- a user can
     * own more than one Grocery space, and without this, opening ANY of
     * them returned every list from ALL of them merged together (a
     * second Grocery space looked like it "inherited" the first one's
     * lists). The "shared with me" half stays unscoped on purpose: a
     * list someone else shared should surface no matter which of the
     * user's own spaces they're currently viewing. */
    private function visibleGroceryLists(Request $request, $spaceId)
    {
        return Item::where('type', 'grocery_list')
            ->where(function ($q) use ($request, $spaceId) {
                $q->where(function ($own) use ($request, $spaceId) {
                    $own->where('space_id', $spaceId)
                        ->whereHas('space', fn ($s) => $s->where('user_id', $request->user()->id));
                })->orWhereHas('members', fn ($m) => $m->where('users.id', $request->user()->id));
            })
            ->with('user:id,name,email')
            ->get();
    }

    /**
     * GET /api/grocery/mine?space_id=X -- everything Grocery shows on
     * Home for the Grocery space X: every list this user can see there
     * (that space's own, regardless of state, plus any list someone else
     * shared with them from anywhere) and every item on those lists.
     * This is what makes sharing a "state" on the list rather than a
     * different space to visit: a shared list surfaces right here, next
     * to the user's own, the moment they open their own Grocery space --
     * no navigating into someone else's space at all.
     *
     * Bounded to the spaces actually involved (X itself, plus whichever
     * spaces host a list they were added to) rather than scanning every
     * grocery_item in the database.
     */
    public function myGrocery(Request $request)
    {
        $space = $this->accessibleSpace($request, $request->input('space_id'));
        if (!$space) {
            return response()->json(['message' => 'Spațiul nu există sau nu îți aparține.'], 404);
        }

        $lists = $this->visibleGroceryLists($request, $space->id);

        $visibleListIds = $lists->pluck('id')->map(fn ($id) => (string) $id);
        $spaceIds = $lists->pluck('space_id')->filter()->unique()->values();

        $items = Item::where('type', 'grocery_item')
            ->whereIn('space_id', $spaceIds)
            ->with('user:id,name,email')
            ->get()
            ->filter(function (Item $item) use ($visibleListIds) {
                $listId = $item->metadata['listId'] ?? null;
                return $listId !== null && $visibleListIds->contains((string) $listId);
            })
            ->values();

        return response()->json([
            'lists' => $lists->values(),
            'items' => $items,
        ]);
    }

    // GET /api/items
    public function index(Request $request)
    {
        if ($request->filled('space_id')) {
            $space = $this->accessibleSpace($request, $request->input('space_id'));

            if (!$space) {
                return response()->json([
                    'message' => 'Spațiul nu există sau nu îți aparține.'
                ], 404);
            }

            $query = Item::where('space_id', $space->id);

            if ($request->filled('type')) {
                $query->where('type', $request->input('type'));
            }

            return response()->json($query->with('user:id,name,email')->get());
        }

        $query = Item::where('user_id', $request->user()->id);

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        return response()->json($query->with('user:id,name,email')->get());
    }

    // POST /api/items
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'space_id'      => 'nullable|exists:spaces,id',
            // Whitelisted against Item::VALID_TYPES -- a typo'd/invalid
            // type used to be silently accepted and become a
            // permanently-invisible orphan row (every space's own load
            // query filters on its own known type constants).
            'type'          => ['required', 'string', 'max:30', Rule::in(Item::VALID_TYPES)],
            'title'         => 'required|string|max:255',
            'notes'         => 'nullable|string',
            'status'        => 'nullable|string|max:30',
            'priority'      => 'nullable|string|max:20',
            'due_at'        => 'nullable|date',
            'completed_at'  => 'nullable|date',
            // No type in the app has a real negative-amount concept
            // (no refund/credit feature anywhere) -- every form already
            // blocks it client-side, but nothing enforced it server-side.
            // A full-app QA sweep demonstrated the gap silently corrupts
            // "this month" spend totals (Budget, Dashboard, every
            // Space's own stat card) when hit directly, bypassing the
            // form.
            'amount'        => 'nullable|numeric|min:0',
            'currency'      => 'nullable|string|max:3',
            'category'      => 'nullable|string|max:100',
            'recurrence'    => 'nullable|string|max:100',
            'metadata'      => 'nullable|array',
            // "Bani fără vină" -- only on Item::guiltFreeTypes(), checked
            // in budgetFieldErrors() below.
            'guilt_free'    => 'sometimes|boolean',
        ]);

        // A document is created with its expiry date -- urgency and
        // "Expiră pe" are computed from it. The issue date is optional
        // (2026-10-15): Simplu's quick add only asks for the expiry, and a
        // renewal without one assumes a 12-month period (documentRenewal.ts).
        // The full forms still ask for both. When both are sent they must be
        // in order. Car stores "dd.mm.yyyy", Casă an ISO date; either is
        // accepted.
        $validator->after(function ($v) use ($request) {
            if (!in_array($request->input('type'), ['car_document', 'home_document'], true)) {
                return;
            }
            $issue = $this->documentDate($request->input('metadata.issueDate'));
            $expiry = $this->documentDate($request->input('metadata.expiryDate'));
            $rawIssue = $request->input('metadata.issueDate');
            if (!$issue && $rawIssue !== null && $rawIssue !== '') {
                $v->errors()->add('metadata.issueDate', 'Data emiterii nu e validă.');
            }
            if (!$expiry) {
                $v->errors()->add('metadata.expiryDate', 'Data expirării este obligatorie.');
            }
            if ($issue && $expiry && $expiry->lt($issue)) {
                $v->errors()->add('metadata.expiryDate', 'Data expirării nu poate fi înaintea celei de emitere.');
            }
        });

        if ($validator->fails()) {
            // `message` = the first error, shown as-is by lib/api.ts.
            return response()->json(['message' => $validator->errors()->first(), 'errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();

        if ($data['type'] === 'grocery_item') {
            // A grocery_item's space is never the client's call -- it's
            // whatever space its OWN list lives in, full stop. A shared
            // list can live in someone else's space; trusting a client-
            // supplied space_id here would let a product silently get
            // filed under the wrong space (typically: the adder's own
            // space instead of the list-owner's), breaking myGrocery()'s
            // per-space item lookup for everyone else on that list.
            $listId = $data['metadata']['listId'] ?? null;
            $list = $listId ? Item::find($listId) : null;

            if (!$list || !$this->canAccessList($request, $list)) {
                return response()->json([
                    'message' => 'Lista specificată nu există sau nu ai acces la ea.'
                ], 404);
            }

            $data['space_id'] = $list->space_id;
        } elseif ($data['type'] === 'grocery_list') {
            // Structural and STRICTLY owner-only -- a space is someone's
            // "house"; being a guest on one list inside it (or even on
            // several) never means you can add a sibling list to THEIR
            // space. Wanting a list of your own means creating it in a
            // space you actually own -- see myGrocery()'s docs for how
            // a list you're merely invited to still ends up on your
            // Home without living in your space.
            $space = !empty($data['space_id']) ? Space::find($data['space_id']) : null;

            if (!$space || $space->user_id !== $request->user()->id) {
                return response()->json([
                    'message' => 'Spațiul nu există sau nu îți aparține.'
                ], 404);
            }
        } elseif (!empty($data['space_id'])) {
            $space = Space::find($data['space_id']);

            if (!$space || !Space::accessibleBy($request->user())->where('id', $space->id)->exists()) {
                return response()->json([
                    'message' => 'Spațiul nu există sau nu îți aparține.'
                ], 404);
            }
        }

        if ($error = $this->budgetFieldErrors($request, $data, null)) {
            return $error;
        }

        $data['user_id'] = $request->user()->id;

        $item = Item::create($data);

        return response()->json($item->load('user:id,name,email'), 201);
    }

    // GET /api/items/{id}
    public function show(Request $request, $id)
    {
        $item = Item::find($id);

        if (!$item || !$this->canAccessItem($request, $item)) {
            return response()->json(['message' => 'Înregistrarea nu a fost găsită.'], 404);
        }

        return response()->json($item->load('user:id,name,email'));
    }

    // PUT /api/items/{id}
    public function update(Request $request, $id)
    {
        $item = Item::find($id);

        if (!$item || !$this->canAccessItem($request, $item)) {
            return response()->json(['message' => 'Înregistrarea nu a fost găsită.'], 404);
        }

        // Renaming the list itself is more than "can use its items" --
        // see canManageList (owner or whoever created this specific list).
        if ($item->type === 'grocery_list' && !$this->canManageList($request, $item)) {
            return response()->json(['message' => 'Doar proprietarul sau cine a creat lista o poate modifica.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'space_id'      => 'nullable|exists:spaces,id',
            // Same whitelist as store() above.
            'type'          => ['sometimes', 'required', 'string', 'max:30', Rule::in(Item::VALID_TYPES)],
            'title'         => 'sometimes|required|string|max:255',
            'notes'         => 'nullable|string',
            'status'        => 'nullable|string|max:30',
            'priority'      => 'nullable|string|max:20',
            'due_at'        => 'nullable|date',
            'completed_at'  => 'nullable|date',
            // Same reasoning as store() above -- no negative-amount
            // concept exists anywhere in the app.
            'amount'        => 'nullable|numeric|min:0',
            'currency'      => 'nullable|string|max:3',
            'category'      => 'nullable|string|max:100',
            'recurrence'    => 'nullable|string|max:100',
            'metadata'      => 'nullable|array',
            // "Bani fără vină" -- only on Item::guiltFreeTypes(), checked
            // in budgetFieldErrors() below.
            'guilt_free'    => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            // `message` = the first error, shown as-is by lib/api.ts.
            return response()->json(['message' => $validator->errors()->first(), 'errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();

        // Retyping an item ACROSS the grocery/non-grocery boundary is
        // never legitimate, and closing it here is what actually matters
        // security-wise: grocery_list's owner-only creation rule (see
        // store() above) only ever runs at creation time. Without this,
        // canAccessItem() above already lets any space member load an
        // item they have plain space-level access to (e.g. their own
        // home_task), and the two checks below used to key off the item's
        // PRE-update type -- so retyping a non-grocery item straight to
        // grocery_list skipped canManageList entirely (it only fires for
        // an item that was ALREADY a list) and skipped the space_id
        // stripping too, letting the request's own space_id (any space
        // the attacker merely has access to) pass through unchecked.
        // Rejecting the boundary crossing outright removes the need to
        // re-derive store()'s authorization rules here a second time.
        $newType = $data['type'] ?? $item->type;
        $wasGrocery = in_array($item->type, ['grocery_list', 'grocery_item'], true);
        $willBeGrocery = in_array($newType, ['grocery_list', 'grocery_item'], true);

        if ($wasGrocery !== $willBeGrocery) {
            return response()->json([
                'message' => 'Tipul unui item nu poate fi schimbat între grocery și alt tip.'
            ], 422);
        }

        if ($willBeGrocery) {
            // A list's space is permanent, and a product's space always
            // tracks its list's (see store() above) -- never move either
            // via a generic update. groceryItemToItemBody on the
            // frontend still sends the adder's own space_id on every
            // save out of habit; silently dropped here rather than
            // trusted, same reasoning as store().
            unset($data['space_id']);
        } elseif (array_key_exists('space_id', $data) && !empty($data['space_id'])) {
            if (!$this->accessibleSpace($request, $data['space_id'])) {
                return response()->json([
                    'message' => 'Spațiul nu există sau nu îți aparține.'
                ], 404);
            }
        }

        // A partial `metadata` object used to be a whole-column
        // overwrite via the mass-update below -- silently dropping
        // every sibling key the caller didn't happen to send. Not hit
        // by the app today (every real *EntryToItemBody mapper always
        // sends the FULL metadata object on every save, never a
        // partial one -- confirmed by this session's own full-app QA
        // sweep), but a live landmine for any future partial-update
        // call. Merging is strictly safer than overwriting: a caller
        // that already sends the full object gets the identical result
        // either way (merge of "everything" over "everything" IS the
        // new object), so this can't regress the current behavior.
        if (array_key_exists('metadata', $data) && is_array($data['metadata'])) {
            $data['metadata'] = array_merge($item->metadata ?? [], $data['metadata']);
        }

        if ($error = $this->budgetFieldErrors($request, $data, $item)) {
            return $error;
        }

        $item->update($data);

        return response()->json($item->load('user:id,name,email'));
    }

    // DELETE /api/items/{id}
    public function destroy(Request $request, $id)
    {
        $item = Item::find($id);

        if (!$item || !$this->canAccessItem($request, $item)) {
            return response()->json(['message' => 'Înregistrarea nu a fost găsită.'], 404);
        }

        if ($item->type === 'grocery_list' && !$this->canManageList($request, $item)) {
            return response()->json(['message' => 'Doar proprietarul sau cine a creat lista o poate șterge.'], 403);
        }

        $item->delete();

        return response()->json(['message' => 'Înregistrarea a fost ștearsă.']);
    }

    /**
     * Persists a drag-to-reorder result for any one list of items --
     * a space's own category list (e.g. Home Tasks), or one grocery
     * list's products. `order` is the full set of item ids in their new
     * display order; there's no separate "list id" parameter because
     * none is needed -- each id is checked individually via
     * canAccessItem() (the same per-type rule every other item endpoint
     * already uses, including grocery's list-membership case), and
     * anything that doesn't pass is silently dropped rather than
     * erroring the whole request, same as SpaceController::reorder().
     * A client is expected to send exactly one list's own ids; mixing
     * ids from two different lists/categories in one call would just
     * apply sequential positions across all of them combined, which is
     * harmless (each list's own read path only ever looks at its own
     * items in that order) but not something any current UI does.
     */
    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'order' => ['required', 'array', 'min:1'],
            'order.*' => ['integer'],
        ]);

        $items = Item::whereIn('id', $validated['order'])->get()->keyBy('id');

        $position = 0;
        foreach ($validated['order'] as $id) {
            $item = $items->get($id);
            if (!$item || !$this->canAccessItem($request, $item)) {
                continue;
            }
            $item->sort_order = $position;
            $item->save();
            $position++;
        }

        return response()->json(['message' => 'Ordinea a fost salvată.']);
    }

    /**
     * List who has access to one grocery list -- the space owner
     * (always) plus its own members. Either can call this: seeing who
     * else is on a list you're already in is fine even if you're not
     * the one managing it.
     */
    public function members(Request $request, $id)
    {
        $item = Item::with('space')->find($id);

        if (!$item || $item->type !== 'grocery_list' || !$this->canAccessList($request, $item)) {
            return response()->json(['message' => 'Înregistrarea nu a fost găsită.'], 404);
        }

        return response()->json([
            'owner' => $item->space?->user()->select('id', 'name', 'email')->first(),
            'members' => $item->members()->select('users.id', 'users.name', 'users.email')->get(),
        ]);
    }

    /**
     * Add an existing user (by email) to ONE list -- owner-only. Just
     * list_members: the list stays exactly where it is (this space),
     * and shows up on the invited person's OWN Home via myGrocery()
     * above -- there's no separate "let them into this space" step
     * anymore, sharing a list never touches Space::members.
     */
    public function addMember(Request $request, $id)
    {
        $item = Item::with('space')->find($id);

        if (!$item || $item->type !== 'grocery_list' || !$item->space || $item->space->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Înregistrarea nu a fost găsită.'], 404);
        }

        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (!$user) {
            return response()->json([
                'message' => 'Nu există niciun cont cu acest email.',
            ], 404);
        }

        if ($user->id === $item->space->user_id) {
            return response()->json([
                'message' => 'Este deja proprietarul acestui spațiu.',
            ], 422);
        }

        $item->members()->syncWithoutDetaching([$user->id]);

        return response()->json([
            'message' => 'Membru adăugat cu succes.',
            'member' => $user->only(['id', 'name', 'email']),
        ], 201);
    }

    /**
     * Remove someone from ONE list -- owner-only. Also settles what
     * happens to the products they added on it (their `user_id` on each
     * grocery_item, shown as the avatar "tag" on the row):
     *   - remove_items=true: those products are deleted along with them.
     *   - remove_items=false (default): the products stay on the list,
     *     just untagged (user_id nulled -- see the migration that made
     *     this column nullable) rather than left pointing at someone who
     *     can no longer even see this list.
     * Scoped to grocery_item rows actually on THIS list (matched via
     * metadata.listId, the same way myGrocery()/index() do it) within
     * this list's own space -- never touches that person's items on any
     * other list.
     */
    public function removeMember(Request $request, $id, $userId)
    {
        $item = Item::with('space')->find($id);

        if (!$item || $item->type !== 'grocery_list' || !$item->space || $item->space->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Înregistrarea nu a fost găsită.'], 404);
        }

        $theirItemsOnThisList = Item::where('space_id', $item->space_id)
            ->where('type', 'grocery_item')
            ->where('user_id', $userId)
            ->get()
            ->filter(fn (Item $i) => (string) ($i->metadata['listId'] ?? null) === (string) $item->id);

        if ($request->boolean('remove_items')) {
            foreach ($theirItemsOnThisList as $i) {
                $i->delete();
            }
        } else {
            foreach ($theirItemsOnThisList as $i) {
                $i->update(['user_id' => null]);
            }
        }

        $item->members()->detach($userId);

        return response()->json([
            'message' => 'Membru eliminat cu succes.',
            'affected_item_ids' => $theirItemsOnThisList->pluck('id')->values(),
            'items_deleted' => $request->boolean('remove_items'),
        ]);
    }

    /** Budget-from-income rules (guilt_free, expense_credit) shared by
     * store() and update() ($item = null on create). The rules themselves
     * live in App\Support\ItemBudgetRules (also used by
     * SpaceController::store for a car/home created "în rate"). Mutates
     * $data; returns a 422 response on a violation, null when fine. */
    private function budgetFieldErrors(Request $request, array &$data, ?Item $item)
    {
        $errors = ItemBudgetRules::errors($request->user(), $data, $item);

        // `message` = the first error, so the client shows it as-is
        // (lib/api.ts reads body.message before body.errors).
        return $errors
            ? response()->json(['message' => array_values($errors)[0][0], 'errors' => $errors], 422)
            : null;
    }

    // "10.10.2026" (Car) or an ISO date (Casă) -> Carbon, null if missing/invalid.
    private function documentDate($value): ?\Carbon\Carbon
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        try {
            return preg_match('/^\d{2}\.\d{2}\.\d{4}$/', $value)
                ? \Carbon\Carbon::createFromFormat('d.m.Y', $value)->startOfDay()
                : \Carbon\Carbon::parse($value);
        } catch (\Exception $e) {
            return null;
        }
    }
}
