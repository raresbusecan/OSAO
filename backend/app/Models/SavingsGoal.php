<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SavingsGoal extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'target_amount',
        'current_amount',
        'target_date',
        'last_applied_month',
        'cadence',
        'cadence_amount',
        'cadence_since',
        'reminders_since',
    ];

    protected $casts = [
        'target_amount' => 'decimal:2',
        'current_amount' => 'decimal:2',
        'target_date' => 'date',
        'last_applied_month' => 'date',
        'cadence_amount' => 'decimal:2',
        'cadence_since' => 'date:Y-m-d',
        'reminders_since' => 'date:Y-m-d',
    ];

    /** A target still to reach (its rhythm's reminders only run then). */
    public function isOpen(): bool
    {
        return (float) $this->target_amount > 0 && (float) $this->current_amount < (float) $this->target_amount;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
