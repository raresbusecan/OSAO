<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Space;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

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
            return response()->json(['message' => 'Space-ul specificat nu exista sau nu iti apartine.'], 404);
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
                    'message' => 'Space-ul specificat nu exista sau nu iti apartine.'
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
            'type'          => 'required|string|max:30',
            'title'         => 'required|string|max:255',
            'notes'         => 'nullable|string',
            'status'        => 'nullable|string|max:30',
            'priority'      => 'nullable|string|max:20',
            'due_at'        => 'nullable|date',
            'completed_at'  => 'nullable|date',
            'amount'        => 'nullable|numeric',
            'currency'      => 'nullable|string|max:3',
            'category'      => 'nullable|string|max:100',
            'recurrence'    => 'nullable|string|max:100',
            'metadata'      => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
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
                    'message' => 'Space-ul specificat nu exista sau nu iti apartine.'
                ], 404);
            }
        } elseif (!empty($data['space_id'])) {
            $space = Space::find($data['space_id']);

            if (!$space || !Space::accessibleBy($request->user())->where('id', $space->id)->exists()) {
                return response()->json([
                    'message' => 'Space-ul specificat nu exista sau nu iti apartine.'
                ], 404);
            }
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
            return response()->json(['message' => 'Item negasit.'], 404);
        }

        return response()->json($item->load('user:id,name,email'));
    }

    // PUT /api/items/{id}
    public function update(Request $request, $id)
    {
        $item = Item::find($id);

        if (!$item || !$this->canAccessItem($request, $item)) {
            return response()->json(['message' => 'Item negasit.'], 404);
        }

        // Renaming the list itself is more than "can use its items" --
        // see canManageList (owner or whoever created this specific list).
        if ($item->type === 'grocery_list' && !$this->canManageList($request, $item)) {
            return response()->json(['message' => 'Doar proprietarul sau cine a creat lista o poate modifica.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'space_id'      => 'nullable|exists:spaces,id',
            'type'          => 'sometimes|required|string|max:30',
            'title'         => 'sometimes|required|string|max:255',
            'notes'         => 'nullable|string',
            'status'        => 'nullable|string|max:30',
            'priority'      => 'nullable|string|max:20',
            'due_at'        => 'nullable|date',
            'completed_at'  => 'nullable|date',
            'amount'        => 'nullable|numeric',
            'currency'      => 'nullable|string|max:3',
            'category'      => 'nullable|string|max:100',
            'recurrence'    => 'nullable|string|max:100',
            'metadata'      => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json($validator->errors(), 422);
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
                    'message' => 'Space-ul specificat nu exista sau nu iti apartine.'
                ], 404);
            }
        }

        $item->update($data);

        return response()->json($item->load('user:id,name,email'));
    }

    // DELETE /api/items/{id}
    public function destroy(Request $request, $id)
    {
        $item = Item::find($id);

        if (!$item || !$this->canAccessItem($request, $item)) {
            return response()->json(['message' => 'Item negasit.'], 404);
        }

        if ($item->type === 'grocery_list' && !$this->canManageList($request, $item)) {
            return response()->json(['message' => 'Doar proprietarul sau cine a creat lista o poate șterge.'], 403);
        }

        $item->delete();

        return response()->json(['message' => 'Item sters cu succes.']);
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
            return response()->json(['message' => 'Item negasit.'], 404);
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
            return response()->json(['message' => 'Item negasit.'], 404);
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
                'message' => 'Este deja proprietarul acestui space.',
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
            return response()->json(['message' => 'Item negasit.'], 404);
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
}
