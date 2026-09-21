<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Space extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'description',
        'icon',
        'color',
        'type',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class);
    }

    /** Everyone the owner has shared this space with -- not the owner
     * themselves, see isAccessibleBy()/scopeAccessibleBy() below for
     * "can this user use this space at all". */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'space_members')->withTimestamps();
    }

    public function isAccessibleBy(User $user): bool
    {
        return $this->user_id === $user->id
            || $this->members()->where('users.id', $user->id)->exists();
    }

    /** Spaces a user can use -- owned OR shared with them. The one place
     * this check lives; SpaceController and ItemController both query
     * through this instead of re-deriving the same "owner or member"
     * condition. */
    public function scopeAccessibleBy(Builder $query, User $user): Builder
    {
        return $query->where(function (Builder $q) use ($user) {
            $q->where('user_id', $user->id)
                ->orWhereHas('members', fn (Builder $q2) => $q2->where('users.id', $user->id));
        });
    }

    public function carProfile(): HasOne
    {
        return $this->hasOne(CarProfile::class);
    }

    public function homeProfile(): HasOne
    {
        return $this->hasOne(HomeProfile::class);
    }
}