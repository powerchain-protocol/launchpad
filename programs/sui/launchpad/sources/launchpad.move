module powerchain_launchpad::launchpad;

use powerchain_launchpad::adapter_registry::{Self, AdapterRegistry};
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;
use sui::sui::SUI;

const E_INVALID_VENUE: u64 = 1;
const E_INVALID_PAYOUTS: u64 = 2;
const E_INVALID_FEE: u64 = 3;
const E_INVALID_THRESHOLD: u64 = 4;
const E_INVALID_WINDOW: u64 = 5;
const E_INVALID_REVIEW_HASH: u64 = 6;
const E_INVALID_ADAPTER: u64 = 7;
const E_INVALID_ELIGIBILITY: u64 = 8;
const E_INVALID_DEV_BUY: u64 = 9;

const VENUE_CETUS: u8 = 0;
const VENUE_DEEPBOOK: u8 = 1;
const VENUE_TURBOS: u8 = 2;
const BPS_TOTAL: u64 = 10_000;
const LAUNCH_FEE_MIST: u64 = 2_000_000_000;

public struct Launch<phantom T> has key {
    id: UID,
    creator: address,
    treasury_cap: TreasuryCap<T>,
    payout_recipients: vector<address>,
    payout_bps: vector<u16>,
    graduation_venue: u8,
    graduation_registry_id: ID,
    graduation_adapter_id_hash: vector<u8>,
    graduation_adapter_version: u64,
    graduation_adapter_config_hash: vector<u8>,
    review_hash: vector<u8>,
    anti_bot_delay_ms: u64,
    initial_price_atomic: u64,
    graduation_threshold_atomic: u64,
    max_initial_purchase_per_wallet_atomic: u64,
    launch_window_open_ms: u64,
    launch_window_close_ms: u64,
    eligibility_mode: u8,
    eligibility_policy_id_hash: vector<u8>,
    eligibility_commitment: vector<u8>,
    dev_buy_enabled: bool,
    dev_buy_amount_atomic: u64,
    dev_buy_payment_asset_hash: vector<u8>,
    dev_vesting_enabled: bool,
    dev_vesting_template_hash: vector<u8>,
    quote_balance: Balance<SUI>,
    sold_tokens: u64,
    created_at_ms: u64,
}

public struct LaunchCreated has copy, drop {
    launch_id: ID,
    creator: address,
    graduation_venue: u8,
    graduation_registry_id: ID,
    graduation_adapter_id_hash: vector<u8>,
    graduation_adapter_version: u64,
    graduation_adapter_config_hash: vector<u8>,
    review_hash: vector<u8>,
}

public fun create_launch<T>(
    registry: &AdapterRegistry,
    treasury_cap: TreasuryCap<T>,
    fee: Coin<SUI>,
    fee_vault: address,
    payout_recipients: vector<address>,
    payout_bps: vector<u16>,
    graduation_venue: u8,
    graduation_adapter_id_hash: vector<u8>,
    graduation_adapter_version: u64,
    graduation_adapter_config_hash: vector<u8>,
    review_hash: vector<u8>,
    anti_bot_delay_ms: u64,
    initial_price_atomic: u64,
    graduation_threshold_atomic: u64,
    max_initial_purchase_per_wallet_atomic: u64,
    launch_window_open_ms: u64,
    launch_window_close_ms: u64,
    eligibility_mode: u8,
    eligibility_policy_id_hash: vector<u8>,
    eligibility_commitment: vector<u8>,
    dev_buy_enabled: bool,
    dev_buy_amount_atomic: u64,
    dev_buy_payment_asset_hash: vector<u8>,
    dev_vesting_enabled: bool,
    dev_vesting_template_hash: vector<u8>,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): Launch<T> {
    assert!(graduation_venue <= VENUE_TURBOS, E_INVALID_VENUE);
    assert!(initial_price_atomic > 0 && graduation_threshold_atomic > 0, E_INVALID_THRESHOLD);
    assert!(coin::value(&fee) == LAUNCH_FEE_MIST, E_INVALID_FEE);
    assert!(review_hash.length() == 32, E_INVALID_REVIEW_HASH);
    assert!(graduation_adapter_id_hash.length() == 32, E_INVALID_ADAPTER);
    assert!(graduation_adapter_config_hash.length() == 32, E_INVALID_ADAPTER);
    assert!(
        (launch_window_open_ms == 0 && launch_window_close_ms == 0) ||
        (launch_window_open_ms > 0 && launch_window_close_ms > launch_window_open_ms),
        E_INVALID_WINDOW,
    );
    assert!(eligibility_mode <= 2, E_INVALID_ELIGIBILITY);
    if (eligibility_mode != 0) {
        assert!(eligibility_policy_id_hash.length() == 32, E_INVALID_ELIGIBILITY);
        assert!(eligibility_commitment.length() == 32, E_INVALID_ELIGIBILITY);
    };
    if (dev_buy_enabled) {
        assert!(dev_buy_amount_atomic > 0, E_INVALID_DEV_BUY);
        assert!(dev_buy_payment_asset_hash.length() == 32, E_INVALID_DEV_BUY);
        if (dev_vesting_enabled) {
            assert!(dev_vesting_template_hash.length() == 32, E_INVALID_DEV_BUY);
        };
    } else {
        assert!(dev_buy_amount_atomic == 0 && !dev_vesting_enabled, E_INVALID_DEV_BUY);
    };
    assert!(payout_recipients.length() == payout_bps.length() && payout_bps.length() > 0, E_INVALID_PAYOUTS);

    let mut total_bps = 0u64;
    let mut i = 0;
    while (i < payout_bps.length()) {
        let bps = *payout_bps.borrow(i);
        assert!(bps > 0, E_INVALID_PAYOUTS);
        total_bps = total_bps + (bps as u64);
        i = i + 1;
    };
    assert!(total_bps == BPS_TOTAL, E_INVALID_PAYOUTS);

    adapter_registry::assert_adapter(
        registry,
        graduation_venue,
        graduation_adapter_id_hash,
        graduation_adapter_version,
        graduation_adapter_config_hash,
    );

    transfer::public_transfer(fee, fee_vault);

    Launch<T> {
        id: object::new(ctx),
        creator: ctx.sender(),
        treasury_cap,
        payout_recipients,
        payout_bps,
        graduation_venue,
        graduation_registry_id: adapter_registry::id(registry),
        graduation_adapter_id_hash,
        graduation_adapter_version,
        graduation_adapter_config_hash,
        review_hash,
        anti_bot_delay_ms,
        initial_price_atomic,
        graduation_threshold_atomic,
        max_initial_purchase_per_wallet_atomic,
        launch_window_open_ms,
        launch_window_close_ms,
        eligibility_mode,
        eligibility_policy_id_hash,
        eligibility_commitment,
        dev_buy_enabled,
        dev_buy_amount_atomic,
        dev_buy_payment_asset_hash,
        dev_vesting_enabled,
        dev_vesting_template_hash,
        quote_balance: balance::zero<SUI>(),
        sold_tokens: 0,
        created_at_ms: clock.timestamp_ms(),
    }
}

public fun activate_launch<T>(launch: Launch<T>) {
    event::emit(LaunchCreated {
        launch_id: object::id(&launch),
        creator: launch.creator,
        graduation_venue: launch.graduation_venue,
        graduation_registry_id: launch.graduation_registry_id,
        graduation_adapter_id_hash: launch.graduation_adapter_id_hash,
        graduation_adapter_version: launch.graduation_adapter_version,
        graduation_adapter_config_hash: launch.graduation_adapter_config_hash,
        review_hash: launch.review_hash,
    });
    transfer::share_object(launch);
}

// Read-only immutable launch facts. There are intentionally no setters.
public fun graduation_venue<T>(launch: &Launch<T>): u8 { launch.graduation_venue }
public fun graduation_registry_id<T>(launch: &Launch<T>): ID { launch.graduation_registry_id }
public fun graduation_adapter_version<T>(launch: &Launch<T>): u64 { launch.graduation_adapter_version }
public fun review_hash<T>(launch: &Launch<T>): &vector<u8> { &launch.review_hash }
public fun creator<T>(launch: &Launch<T>): address { launch.creator }
public fun graduation_threshold<T>(launch: &Launch<T>): u64 { launch.graduation_threshold_atomic }
public fun max_initial_purchase_per_wallet<T>(launch: &Launch<T>): u64 { launch.max_initial_purchase_per_wallet_atomic }
public fun launch_window<T>(launch: &Launch<T>): (u64, u64) { (launch.launch_window_open_ms, launch.launch_window_close_ms) }
public fun eligibility_mode<T>(launch: &Launch<T>): u8 { launch.eligibility_mode }
public fun dev_buy_enabled<T>(launch: &Launch<T>): bool { launch.dev_buy_enabled }
