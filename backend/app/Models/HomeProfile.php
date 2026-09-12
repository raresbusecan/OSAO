<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HomeProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'space_id',
        'county',
        'city',
        'ownership',
        'purchase_price',
    ];

    protected $casts = [
        'purchase_price' => 'float',
    ];

    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }
}
