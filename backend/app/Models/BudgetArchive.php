<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BudgetArchive extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'month',
        'category',
        'budget_limit',
        'spent',
        'diff',
    ];

    protected $casts = [
        'month' => 'date',
        'budget_limit' => 'decimal:2',
        'spent' => 'decimal:2',
        'diff' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
