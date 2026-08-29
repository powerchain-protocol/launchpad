use anchor_lang::prelude::*;

// Placeholder only for source distribution. `anchor keys sync` must replace this
// before deployment; the application runtime rejects the system program as a
// production launchpad program id.
declare_id!("11111111111111111111111111111111");

const MAX_PAYOUTS: usize = 20;
const BPS_TOTAL: u32 = 10_000;
const TOKEN_2022_PROGRAM_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

#[program]
pub mod powerchain_launchpad_program {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        let registry = &mut ctx.accounts.registry;
        registry.authority = ctx.accounts.authority.key();
        registry.bump = ctx.bumps.registry;
        Ok(())
    }

    pub fn upsert_adapter(
        ctx: Context<UpsertAdapter>,
        venue: u8,
        version: u32,
        adapter_id_hash: [u8; 32],
        config_hash: [u8; 32],
        adapter_program: Pubkey,
        active: bool,
    ) -> Result<()> {
        require!(venue <= 2, LaunchError::InvalidVenue);
        require!(version > 0, LaunchError::InvalidAdapterVersion);
        let entry = &mut ctx.accounts.adapter_entry;
        entry.registry = ctx.accounts.registry.key();
        entry.venue = venue;
        entry.version = version;
        entry.adapter_id_hash = adapter_id_hash;
        entry.config_hash = config_hash;
        entry.adapter_program = adapter_program;
        entry.active = active;
        entry.bump = ctx.bumps.adapter_entry;
        Ok(())
    }

    pub fn initialize_launch(
        ctx: Context<InitializeLaunch>,
        args: InitializeLaunchArgs,
    ) -> Result<()> {
        validate_launch_args(&args)?;
        require_keys_eq!(
            *ctx.accounts.mint.to_account_info().owner,
            TOKEN_2022_PROGRAM_ID,
            LaunchError::InvalidMintProgram
        );
        require!(ctx.accounts.adapter_entry.active, LaunchError::AdapterDisabled);
        require!(ctx.accounts.adapter_entry.venue == args.venue, LaunchError::AdapterMismatch);
        require!(ctx.accounts.adapter_entry.version == args.adapter_version, LaunchError::AdapterMismatch);
        require!(ctx.accounts.adapter_entry.adapter_id_hash == args.adapter_id_hash, LaunchError::AdapterMismatch);
        require!(ctx.accounts.adapter_entry.config_hash == args.adapter_config_hash, LaunchError::AdapterMismatch);

        let clock = Clock::get()?;
        let launch = &mut ctx.accounts.launch;
        launch.creator = ctx.accounts.creator.key();
        launch.mint = ctx.accounts.mint.key();
        launch.registry = ctx.accounts.registry.key();
        launch.adapter_entry = ctx.accounts.adapter_entry.key();
        launch.venue = args.venue;
        launch.adapter_version = args.adapter_version;
        launch.adapter_id_hash = args.adapter_id_hash;
        launch.adapter_config_hash = args.adapter_config_hash;
        launch.review_hash = args.review_hash;
        launch.initial_price_atomic = args.initial_price_atomic;
        launch.graduation_threshold_atomic = args.graduation_threshold_atomic;
        launch.anti_bot_delay_seconds = args.anti_bot_delay_seconds;
        launch.max_initial_purchase_per_wallet_atomic = args.max_initial_purchase_per_wallet_atomic;
        launch.opens_at = args.opens_at;
        launch.closes_at = args.closes_at;
        launch.eligibility_mode = args.eligibility_mode;
        launch.eligibility_policy_hash = args.eligibility_policy_hash;
        launch.eligibility_commitment = args.eligibility_commitment;
        launch.dev_buy_enabled = args.dev_buy_enabled;
        launch.dev_buy_amount_atomic = args.dev_buy_amount_atomic;
        launch.dev_buy_payment_asset_hash = args.dev_buy_payment_asset_hash;
        launch.dev_vesting_enabled = args.dev_vesting_enabled;
        launch.dev_vesting_template_hash = args.dev_vesting_template_hash;
        launch.payouts = args.payouts;
        launch.created_at = clock.unix_timestamp;
        launch.locked = true;
        launch.bump = ctx.bumps.launch;

        emit!(LaunchInitialized {
            launch: launch.key(),
            creator: launch.creator,
            mint: launch.mint,
            venue: launch.venue,
            adapter_version: launch.adapter_version,
            review_hash: launch.review_hash,
        });
        Ok(())
    }

    /// Called atomically by an approved curve/purchase adapter to enforce the
    /// creator's launch window and per-wallet initial purchase limit.
    pub fn record_initial_purchase(
        ctx: Context<RecordInitialPurchase>,
        amount_atomic: u64,
    ) -> Result<()> {
        require!(amount_atomic > 0, LaunchError::InvalidPurchaseAmount);
        let launch = &ctx.accounts.launch;
        let now = Clock::get()?.unix_timestamp;
        if launch.opens_at > 0 {
            require!(now >= launch.opens_at, LaunchError::LaunchNotOpen);
        }
        if launch.closes_at > 0 {
            require!(now <= launch.closes_at, LaunchError::LaunchClosed);
        }
        if launch.anti_bot_delay_seconds > 0 {
            let earliest = launch
                .created_at
                .checked_add(launch.anti_bot_delay_seconds as i64)
                .ok_or(LaunchError::ArithmeticOverflow)?;
            require!(now >= earliest, LaunchError::AntiBotDelayActive);
        }

        let counter = &mut ctx.accounts.purchase_counter;
        if counter.buyer == Pubkey::default() {
            counter.launch = launch.key();
            counter.buyer = ctx.accounts.buyer.key();
            counter.bump = ctx.bumps.purchase_counter;
        }
        let next = counter
            .purchased_atomic
            .checked_add(amount_atomic)
            .ok_or(LaunchError::ArithmeticOverflow)?;
        if launch.max_initial_purchase_per_wallet_atomic > 0 {
            require!(
                next <= launch.max_initial_purchase_per_wallet_atomic,
                LaunchError::InitialPurchaseLimitExceeded
            );
        }
        counter.purchased_atomic = next;
        emit!(InitialPurchaseRecorded {
            launch: launch.key(),
            buyer: counter.buyer,
            amount_atomic,
            cumulative_atomic: next,
        });
        Ok(())
    }
}

fn validate_launch_args(args: &InitializeLaunchArgs) -> Result<()> {
    require!(args.venue <= 2, LaunchError::InvalidVenue);
    require!(args.adapter_version > 0, LaunchError::InvalidAdapterVersion);
    require!(args.adapter_id_hash != [0u8; 32], LaunchError::AdapterMismatch);
    require!(args.adapter_config_hash != [0u8; 32], LaunchError::AdapterMismatch);
    require!(args.review_hash != [0u8; 32], LaunchError::InvalidReviewHash);
    require!(args.initial_price_atomic > 0, LaunchError::InvalidCurve);
    require!(args.graduation_threshold_atomic > 0, LaunchError::InvalidCurve);
    require!(args.eligibility_mode <= 2, LaunchError::InvalidEligibilityMode);
    require!(!args.payouts.is_empty() && args.payouts.len() <= MAX_PAYOUTS, LaunchError::InvalidPayouts);
    let total = args.payouts.iter().try_fold(0u32, |sum, payout| {
        require!(payout.basis_points > 0, LaunchError::InvalidPayouts);
        sum.checked_add(payout.basis_points as u32).ok_or(LaunchError::ArithmeticOverflow.into())
    })?;
    require!(total == BPS_TOTAL, LaunchError::InvalidPayouts);
    if args.opens_at > 0 || args.closes_at > 0 {
        require!(args.opens_at > 0 && args.closes_at > args.opens_at, LaunchError::InvalidLaunchWindow);
    }
    if args.eligibility_mode != 0 {
        require!(args.eligibility_policy_hash != [0u8; 32], LaunchError::MissingEligibilityCommitment);
        require!(args.eligibility_commitment != [0u8; 32], LaunchError::MissingEligibilityCommitment);
    }
    if args.dev_buy_enabled {
        require!(args.dev_buy_amount_atomic > 0, LaunchError::InvalidDevBuy);
        require!(args.dev_buy_payment_asset_hash != [0u8; 32], LaunchError::InvalidDevBuy);
        if args.dev_vesting_enabled {
            require!(args.dev_vesting_template_hash != [0u8; 32], LaunchError::InvalidDevBuy);
        }
    } else {
        require!(args.dev_buy_amount_atomic == 0, LaunchError::InvalidDevBuy);
        require!(!args.dev_vesting_enabled, LaunchError::InvalidDevBuy);
    }
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeLaunchArgs {
    pub venue: u8,
    pub adapter_version: u32,
    pub adapter_id_hash: [u8; 32],
    pub adapter_config_hash: [u8; 32],
    pub review_hash: [u8; 32],
    pub initial_price_atomic: u64,
    pub graduation_threshold_atomic: u64,
    pub anti_bot_delay_seconds: u32,
    pub max_initial_purchase_per_wallet_atomic: u64,
    pub opens_at: i64,
    pub closes_at: i64,
    pub eligibility_mode: u8,
    pub eligibility_policy_hash: [u8; 32],
    pub eligibility_commitment: [u8; 32],
    pub dev_buy_enabled: bool,
    pub dev_buy_amount_atomic: u64,
    pub dev_buy_payment_asset_hash: [u8; 32],
    pub dev_vesting_enabled: bool,
    pub dev_vesting_template_hash: [u8; 32],
    pub payouts: Vec<PayoutSplit>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct PayoutSplit {
    pub recipient: Pubkey,
    pub basis_points: u16,
}

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = AdapterRegistry::SPACE,
        seeds = [b"adapter-registry"],
        bump
    )]
    pub registry: Account<'info, AdapterRegistry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(venue: u8, version: u32)]
pub struct UpsertAdapter<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"adapter-registry"],
        bump = registry.bump,
        has_one = authority @ LaunchError::UnauthorizedRegistryMutation
    )]
    pub registry: Account<'info, AdapterRegistry>,
    #[account(
        init_if_needed,
        payer = authority,
        space = AdapterEntry::SPACE,
        seeds = [b"adapter", registry.key().as_ref(), &[venue], &version.to_le_bytes()],
        bump
    )]
    pub adapter_entry: Account<'info, AdapterEntry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: InitializeLaunchArgs)]
pub struct InitializeLaunch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: owner is explicitly required to be the Token-2022 program.
    pub mint: UncheckedAccount<'info>,
    #[account(seeds = [b"adapter-registry"], bump = registry.bump)]
    pub registry: Account<'info, AdapterRegistry>,
    #[account(
        seeds = [b"adapter", registry.key().as_ref(), &[args.venue], &args.adapter_version.to_le_bytes()],
        bump = adapter_entry.bump,
        constraint = adapter_entry.registry == registry.key() @ LaunchError::AdapterMismatch
    )]
    pub adapter_entry: Account<'info, AdapterEntry>,
    #[account(
        init,
        payer = creator,
        space = Launch::SPACE,
        seeds = [b"launch", mint.key().as_ref()],
        bump
    )]
    pub launch: Account<'info, Launch>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordInitialPurchase<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"launch", launch.mint.as_ref()], bump = launch.bump)]
    pub launch: Account<'info, Launch>,
    #[account(
        init_if_needed,
        payer = buyer,
        space = PurchaseCounter::SPACE,
        seeds = [b"purchase", launch.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub purchase_counter: Account<'info, PurchaseCounter>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct AdapterRegistry {
    pub authority: Pubkey,
    pub bump: u8,
}
impl AdapterRegistry { pub const SPACE: usize = 8 + 32 + 1; }

#[account]
pub struct AdapterEntry {
    pub registry: Pubkey,
    pub venue: u8,
    pub version: u32,
    pub adapter_id_hash: [u8; 32],
    pub config_hash: [u8; 32],
    pub adapter_program: Pubkey,
    pub active: bool,
    pub bump: u8,
}
impl AdapterEntry { pub const SPACE: usize = 8 + 32 + 1 + 4 + 32 + 32 + 32 + 1 + 1; }

#[account]
pub struct Launch {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub registry: Pubkey,
    pub adapter_entry: Pubkey,
    pub venue: u8,
    pub adapter_version: u32,
    pub adapter_id_hash: [u8; 32],
    pub adapter_config_hash: [u8; 32],
    pub review_hash: [u8; 32],
    pub initial_price_atomic: u64,
    pub graduation_threshold_atomic: u64,
    pub anti_bot_delay_seconds: u32,
    pub max_initial_purchase_per_wallet_atomic: u64,
    pub opens_at: i64,
    pub closes_at: i64,
    pub eligibility_mode: u8,
    pub eligibility_policy_hash: [u8; 32],
    pub eligibility_commitment: [u8; 32],
    pub dev_buy_enabled: bool,
    pub dev_buy_amount_atomic: u64,
    pub dev_buy_payment_asset_hash: [u8; 32],
    pub dev_vesting_enabled: bool,
    pub dev_vesting_template_hash: [u8; 32],
    pub payouts: Vec<PayoutSplit>,
    pub created_at: i64,
    pub locked: bool,
    pub bump: u8,
}
impl Launch {
    pub const SPACE: usize = 8
        + (32 * 4) // creator, mint, registry, adapter entry
        + 1 + 4 + 32 + 32 + 32 // venue, adapter version/id/config, review hash
        + 8 + 8 + 4 + 8 + 8 + 8 // curve, anti-bot, limit, window
        + 1 + 32 + 32 // eligibility
        + 1 + 8 + 32 + 1 + 32 // dev buy + vesting commitments
        + 4 + (MAX_PAYOUTS * (32 + 2))
        + 8 + 1 + 1;
}

#[account]
pub struct PurchaseCounter {
    pub launch: Pubkey,
    pub buyer: Pubkey,
    pub purchased_atomic: u64,
    pub bump: u8,
}
impl PurchaseCounter { pub const SPACE: usize = 8 + 32 + 32 + 8 + 1; }

#[event]
pub struct LaunchInitialized {
    pub launch: Pubkey,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub venue: u8,
    pub adapter_version: u32,
    pub review_hash: [u8; 32],
}

#[event]
pub struct InitialPurchaseRecorded {
    pub launch: Pubkey,
    pub buyer: Pubkey,
    pub amount_atomic: u64,
    pub cumulative_atomic: u64,
}

#[error_code]
pub enum LaunchError {
    #[msg("Invalid graduation venue")]
    InvalidVenue,
    #[msg("Invalid graduation adapter version")]
    InvalidAdapterVersion,
    #[msg("Graduation adapter is disabled")]
    AdapterDisabled,
    #[msg("Graduation adapter does not match the governed registry entry")]
    AdapterMismatch,
    #[msg("Only the registry authority may mutate graduation adapters")]
    UnauthorizedRegistryMutation,
    #[msg("Mint must be owned by the SPL Token-2022 program")]
    InvalidMintProgram,
    #[msg("Invalid bonding curve parameters")]
    InvalidCurve,
    #[msg("Payout splits must be valid and total 10,000 basis points")]
    InvalidPayouts,
    #[msg("Invalid launch window")]
    InvalidLaunchWindow,
    #[msg("Invalid eligibility mode")]
    InvalidEligibilityMode,
    #[msg("Restricted launch requires eligibility policy commitments")]
    MissingEligibilityCommitment,
    #[msg("Purchase amount must be positive")]
    InvalidPurchaseAmount,
    #[msg("Launch is not open yet")]
    LaunchNotOpen,
    #[msg("Launch window has closed")]
    LaunchClosed,
    #[msg("Anti-bot delay is still active")]
    AntiBotDelayActive,
    #[msg("Per-wallet initial purchase limit exceeded")]
    InitialPurchaseLimitExceeded,
    #[msg("Invalid signed configuration review hash")]
    InvalidReviewHash,
    #[msg("Invalid developer buy or vesting commitment")]
    InvalidDevBuy,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
