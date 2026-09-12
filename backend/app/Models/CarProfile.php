<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
    ];

    protected $casts = [
        'year' => 'integer',
        'purchase_price' => 'float',
        'tank_capacity' => 'float',
    ];

    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }
}
