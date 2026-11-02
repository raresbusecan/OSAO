<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One "Am pus deoparte X lei" confirmation on the Economii card. */
class SavingsDeposit extends Model
{
    protected $fillable = ['user_id', 'amount', 'cadence', 'deposited_on', 'period_start'];

    protected $casts = [
        'amount' => 'decimal:2',
        'deposited_on' => 'date:Y-m-d',
        'period_start' => 'date:Y-m-d',
    ];
}
