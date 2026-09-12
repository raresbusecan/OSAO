<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Space;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ItemController extends Controller
{
    // GET /api/items
    public function index(Request $request)
    {
        $query = Item::where('user_id', $request->user()->id);

        if ($request->filled('space_id')) {
            $query->where('space_id', $request->input('space_id'));
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        return response()->json($query->get());
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

        // Dacă vine space_id, verificăm că apartine userului autentificat
        if (!empty($data['space_id'])) {
            $space = Space::where('id', $data['space_id'])
                ->where('user_id', $request->user()->id)
                ->first();

            if (!$space) {
                return response()->json([
                    'message' => 'Space-ul specificat nu exista sau nu iti apartine.'
                ], 404);
            }
        }

        $data['user_id'] = $request->user()->id;

        $item = Item::create($data);

        return response()->json($item, 201);
    }

    // GET /api/items/{id}
    public function show(Request $request, $id)
    {
        $item = Item::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$item) {
            return response()->json(['message' => 'Item negasit.'], 404);
        }

        return response()->json($item);
    }

    // PUT /api/items/{id}
    public function update(Request $request, $id)
    {
        $item = Item::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$item) {
            return response()->json(['message' => 'Item negasit.'], 404);
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

        if (array_key_exists('space_id', $data) && !empty($data['space_id'])) {
            $space = Space::where('id', $data['space_id'])
                ->where('user_id', $request->user()->id)
                ->first();

            if (!$space) {
                return response()->json([
                    'message' => 'Space-ul specificat nu exista sau nu iti apartine.'
                ], 404);
            }
        }

        $item->update($data);

        return response()->json($item);
    }

    // DELETE /api/items/{id}
    public function destroy(Request $request, $id)
    {
        $item = Item::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$item) {
            return response()->json(['message' => 'Item negasit.'], 404);
        }

        $item->delete();

        return response()->json(['message' => 'Item sters cu succes.']);
    }
}