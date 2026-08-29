module powerchain_launchpad::vesting;

use sui::coin::{Self, Coin};
use sui::clock::Clock;

const E_NOT_BENEFICIARY: u64 = 1;
const E_NOT_UNLOCKED: u64 = 2;
const E_INVALID_SCHEDULE: u64 = 3;
const E_NOTHING_TO_CLAIM: u64 = 4;
const BPS_TOTAL: u64 = 10_000;
const MAX_TRANCHES: u64 = 32;

public struct LinearVestingLock<phantom T> has key {
    id: UID,
    beneficiary: address,
    tokens: Coin<T>,
    original_amount: u64,
    claimed_amount: u64,
    created_at_ms: u64,
    cliff_ms: u64,
    duration_ms: u64,
}

public struct ProgressiveVestingLock<phantom T> has key {
    id: UID,
    beneficiary: address,
    tokens: Coin<T>,
    original_amount: u64,
    claimed_amount: u64,
    created_at_ms: u64,
    unlock_offsets_ms: vector<u64>,
    tranche_bps: vector<u16>,
}

public fun lock_linear_from_launch<T>(
    tokens: Coin<T>,
    beneficiary: address,
    cliff_ms: u64,
    duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(duration_ms > 0 && cliff_ms <= duration_ms, E_INVALID_SCHEDULE);
    let original_amount = coin::value(&tokens);
    transfer::public_transfer(
        LinearVestingLock<T> {
            id: object::new(ctx), beneficiary, tokens, original_amount,
            claimed_amount: 0, created_at_ms: clock.timestamp_ms(), cliff_ms, duration_ms,
        },
        beneficiary,
    );
}

public fun lock_progressive_from_launch<T>(
    tokens: Coin<T>,
    beneficiary: address,
    unlock_offsets_ms: vector<u64>,
    tranche_bps: vector<u16>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(unlock_offsets_ms.length() > 0 && unlock_offsets_ms.length() <= MAX_TRANCHES && unlock_offsets_ms.length() == tranche_bps.length(), E_INVALID_SCHEDULE);
    let mut total_bps = 0u64;
    let mut prior = 0u64;
    let mut i = 0;
    while (i < unlock_offsets_ms.length()) {
        let offset = *unlock_offsets_ms.borrow(i);
        assert!(i == 0 || offset > prior, E_INVALID_SCHEDULE);
        prior = offset;
        total_bps = total_bps + (*tranche_bps.borrow(i) as u64);
        i = i + 1;
    };
    assert!(total_bps == BPS_TOTAL, E_INVALID_SCHEDULE);

    let original_amount = coin::value(&tokens);
    transfer::public_transfer(
        ProgressiveVestingLock<T> {
            id: object::new(ctx), beneficiary, tokens, original_amount,
            claimed_amount: 0, created_at_ms: clock.timestamp_ms(),
            unlock_offsets_ms, tranche_bps,
        },
        beneficiary,
    );
}

public fun claim_linear<T>(lock: &mut LinearVestingLock<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(ctx.sender() == lock.beneficiary, E_NOT_BENEFICIARY);
    let elapsed = clock.timestamp_ms() - lock.created_at_ms;
    assert!(elapsed >= lock.cliff_ms, E_NOT_UNLOCKED);
    let vested = if (elapsed >= lock.duration_ms) {
        lock.original_amount
    } else {
        ((lock.original_amount as u128) * (elapsed as u128) / (lock.duration_ms as u128)) as u64
    };
    assert!(vested > lock.claimed_amount, E_NOTHING_TO_CLAIM);
    let claimable = vested - lock.claimed_amount;
    let claimed = coin::split(&mut lock.tokens, claimable, ctx);
    lock.claimed_amount = vested;
    transfer::public_transfer(claimed, lock.beneficiary);
}

public fun claim_progressive<T>(lock: &mut ProgressiveVestingLock<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(ctx.sender() == lock.beneficiary, E_NOT_BENEFICIARY);
    let elapsed = clock.timestamp_ms() - lock.created_at_ms;
    let mut vested_bps = 0u64;
    let mut i = 0;
    while (i < lock.unlock_offsets_ms.length()) {
        if (elapsed >= *lock.unlock_offsets_ms.borrow(i)) {
            vested_bps = vested_bps + (*lock.tranche_bps.borrow(i) as u64);
        };
        i = i + 1;
    };
    let vested = ((lock.original_amount as u128) * (vested_bps as u128) / (BPS_TOTAL as u128)) as u64;
    assert!(vested > lock.claimed_amount, E_NOTHING_TO_CLAIM);
    let claimable = vested - lock.claimed_amount;
    let claimed = coin::split(&mut lock.tokens, claimable, ctx);
    lock.claimed_amount = vested;
    transfer::public_transfer(claimed, lock.beneficiary);
}

public fun linear_balance<T>(lock: &LinearVestingLock<T>): u64 { coin::value(&lock.tokens) }
public fun progressive_balance<T>(lock: &ProgressiveVestingLock<T>): u64 { coin::value(&lock.tokens) }
