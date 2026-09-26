<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'timezone'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')
            ->withPivot('created_at');
    }

    public function spaces(): HasMany
    {
        return $this->hasMany(Space::class);
    }

    /** Spaces owned by someone else that this user has been added to --
     * see Space::members(). Kept separate from spaces() (owned only) so
     * "is this my space" stays unambiguous everywhere that already
     * calls spaces(); SpaceController::index() is the one place that
     * merges both. */
    public function sharedSpaces(): BelongsToMany
    {
        return $this->belongsToMany(Space::class, 'space_members')->withTimestamps();
    }

    public function items(): HasMany
    {
        return $this->hasMany(Item::class);
    }

    /** Overrides the base Authenticatable's default (which sends
     * Illuminate\Auth\Notifications\ResetPassword -- built around
     * route('password.reset', ...), which doesn't exist here) with one
     * that links to the Expo app's own reset screen instead. Called
     * internally by Password::sendResetLink(). */
    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token, $this->email));
    }

    /** Only this user's own personal recipes -- library recipes have a
     * null user_id, so they never show up here. See RecipeController. */
    public function recipes(): HasMany
    {
        return $this->hasMany(Recipe::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}

