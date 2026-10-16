<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

class CarProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'space_id',
        'make',
        'model',
        'color',
        'year',
        'purchase_price',
        'tank_capacity',
        'odometer',
        'odometer_updated_at',
    ];

    protected $casts = [
        'year' => 'integer',
        'purchase_price' => 'float',
        'tank_capacity' => 'float',
        'odometer' => 'integer',
        'odometer_updated_at' => 'datetime',
    ];

    /** Entry types whose `metadata.odometer` counts as a logged reading --
     * the same set the Mașină screen's getCurrentOdometer() reads. */
    public const ODOMETER_ITEM_TYPES = ['car_fuel', 'car_maintenance', 'car_expense'];

    /** Highest odometer manual entry accepts (DB column is unsigned int;
     * this keeps a typo far below that, no 500 on overflow). */
    public const ODOMETER_MAX = 2000000;

    /** Highest reading logged on any fuel/service/expense entry of this
     * space (every member's, archived included), 0 if none. */
    public static function loggedOdometer(int $spaceId): int
    {
        $max = Item::where('space_id', $spaceId)
            ->whereIn('type', self::ODOMETER_ITEM_TYPES)
            ->get(['metadata'])
            ->max(fn (Item $r) => is_numeric($r->metadata['odometer'] ?? null) ? (float) $r->metadata['odometer'] : 0);

        return (int) ceil((float) ($max ?? 0));
    }

    /**
     * Folds the manually-set odometer into a [space_id => logged max] map
     * (Dashboard / Calendar), so a reading typed on the top card counts
     * everywhere the logged one does: max(manual, logged) per space.
     */
    public static function withManualOdometers(Collection $logged, iterable $spaceIds): Collection
    {
        $ids = collect($spaceIds)->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return $logged;
        }
        $manual = self::whereIn('space_id', $ids)->whereNotNull('odometer')->pluck('odometer', 'space_id');
        $out = $logged->all();
        foreach ($manual as $spaceId => $odo) {
            $out[$spaceId] = max((float) ($out[$spaceId] ?? 0), (float) $odo);
        }

        return collect($out);
    }

    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }
}
