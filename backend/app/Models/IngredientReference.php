<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class IngredientReference extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'category',
        'aliases',
    ];

    protected $casts = [
        'aliases' => 'array',
    ];
}
