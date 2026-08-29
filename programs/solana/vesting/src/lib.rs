use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

// Source-distribution placeholder only. `anchor keys sync` must replace it from
// the real deployment keypair before any deploy command is permitted.
declare_id!("11111111111111111111111111111111");

const TOKEN_2022_PROGRAM_ID: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const BPS_TOTAL: u32 = 10_000;
const MAX_TRANCHES: usize = 32;
const KIND_LINEAR: u8 = 0;
const KIND_PROGRESSIVE: u8 = 1;

#[program]
pub mod powerchain_vesting_program {
    use super::*;

    pub fn initialize_vesting(
        ctx: Context<InitializeVesting>,
        args: InitializeVestingArgs,
    ) -> Result<()> {
        validate_schedule(&args)?;
        require!(args.deposit_amount > 0, VestingError::InvalidDepositAmount);
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            TOKEN_2022_PROGRAM_ID,
            VestingError::InvalidTokenProgram
        );

        let clock = Clock::get()?;
        let start_at = if args.start_at == 0 { clock.unix_timestamp } else { args.start_at };
        require!(start_at >= 0, VestingError::InvalidStartTime);

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.source.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_accounts),
            args.deposit_amount,
            ctx.accounts.mint.decimals,
        )?;

        // Token-2022 extensions such as TransferFee can make the amount actually
        // credited to the vault lower than the requested transfer amount. The
        // schedule always records the chain-observed spendable vault balance.
        ctx.accounts.vault.reload()?;
        let credited_amount = ctx.accounts.vault.amount;
        require!(credited_amount > 0, VestingError::ZeroCreditedAmount);
        require!(credited_amount <= args.deposit_amount, VestingError::UnexpectedVaultCredit);

        let schedule = &mut ctx.accounts.schedule;
        schedule.depositor = ctx.accounts.depositor.key();
        schedule.beneficiary = ctx.accounts.beneficiary.key();
        schedule.mint = ctx.accounts.mint.key();
        schedule.vault = ctx.accounts.vault.key();
        schedule.schedule_id = args.schedule_id;
        schedule.kind = args.kind;
        schedule.start_at = start_at;
        schedule.cliff_seconds = args.cliff_seconds;
        schedule.duration_seconds = args.duration_seconds;
        schedule.tranches = args.tranches;
        schedule.requested_deposit_amount = args.deposit_amount;
        schedule.total_amount = credited_amount;
        schedule.claimed_amount = 0;
        schedule.bump = ctx.bumps.schedule;
        schedule.vault_bump = ctx.bumps.vault;

        emit!(VestingInitialized {
            schedule: schedule.key(),
            depositor: schedule.depositor,
            beneficiary: schedule.beneficiary,
            mint: schedule.mint,
            requested_deposit_amount: schedule.requested_deposit_amount,
            credited_amount: schedule.total_amount,
            kind: schedule.kind,
            start_at: schedule.start_at,
        });
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.token_program.key(),
            TOKEN_2022_PROGRAM_ID,
            VestingError::InvalidTokenProgram
        );
        let now = Clock::get()?.unix_timestamp;
        let schedule = &mut ctx.accounts.schedule;
        let vested_amount = calculate_vested_amount(schedule, now)?;
        require!(vested_amount > schedule.claimed_amount, VestingError::NothingToClaim);

        let claimable = vested_amount
            .checked_sub(schedule.claimed_amount)
            .ok_or(VestingError::ArithmeticOverflow)?;
        require!(claimable <= ctx.accounts.vault.amount, VestingError::VaultBalanceInvariant);

        let signer_seeds: &[&[u8]] = &[
            b"vesting",
            schedule.mint.as_ref(),
            schedule.beneficiary.as_ref(),
            schedule.schedule_id.as_ref(),
            &[schedule.bump],
        ];
        let signer = &[signer_seeds];
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: schedule.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
                signer,
            ),
            claimable,
            ctx.accounts.mint.decimals,
        )?;

        schedule.claimed_amount = schedule
            .claimed_amount
            .checked_add(claimable)
            .ok_or(VestingError::ArithmeticOverflow)?;

        emit!(VestingClaimed {
            schedule: schedule.key(),
            beneficiary: schedule.beneficiary,
            amount: claimable,
            claimed_total: schedule.claimed_amount,
            vested_total: vested_amount,
        });
        Ok(())
    }
}

fn validate_schedule(args: &InitializeVestingArgs) -> Result<()> {
    match args.kind {
        KIND_LINEAR => {
            require!(args.duration_seconds > 0, VestingError::InvalidSchedule);
            require!(args.cliff_seconds <= args.duration_seconds, VestingError::InvalidSchedule);
            require!(args.tranches.is_empty(), VestingError::InvalidSchedule);
        }
        KIND_PROGRESSIVE => {
            require!(args.cliff_seconds == 0 && args.duration_seconds == 0, VestingError::InvalidSchedule);
            require!(!args.tranches.is_empty() && args.tranches.len() <= MAX_TRANCHES, VestingError::InvalidSchedule);
            let mut total_bps = 0u32;
            let mut previous_offset = None;
            for tranche in args.tranches.iter() {
                require!(tranche.basis_points > 0, VestingError::InvalidSchedule);
                if let Some(previous) = previous_offset {
                    require!(tranche.unlock_offset_seconds > previous, VestingError::InvalidSchedule);
                }
                previous_offset = Some(tranche.unlock_offset_seconds);
                total_bps = total_bps
                    .checked_add(tranche.basis_points as u32)
                    .ok_or(VestingError::ArithmeticOverflow)?;
            }
            require!(total_bps == BPS_TOTAL, VestingError::InvalidSchedule);
        }
        _ => return err!(VestingError::InvalidScheduleKind),
    }
    Ok(())
}

fn calculate_vested_amount(schedule: &VestingSchedule, now: i64) -> Result<u64> {
    if now < schedule.start_at {
        return Ok(0);
    }
    let elapsed_i64 = now
        .checked_sub(schedule.start_at)
        .ok_or(VestingError::ArithmeticOverflow)?;
    let elapsed = u64::try_from(elapsed_i64).map_err(|_| error!(VestingError::ArithmeticOverflow))?;

    match schedule.kind {
        KIND_LINEAR => {
            if elapsed < schedule.cliff_seconds {
                return Ok(0);
            }
            if elapsed >= schedule.duration_seconds {
                return Ok(schedule.total_amount);
            }
            let vested = (schedule.total_amount as u128)
                .checked_mul(elapsed as u128)
                .ok_or(VestingError::ArithmeticOverflow)?
                .checked_div(schedule.duration_seconds as u128)
                .ok_or(VestingError::ArithmeticOverflow)?;
            u64::try_from(vested).map_err(|_| error!(VestingError::ArithmeticOverflow))
        }
        KIND_PROGRESSIVE => {
            let mut vested_bps = 0u32;
            for tranche in schedule.tranches.iter() {
                if elapsed >= tranche.unlock_offset_seconds {
                    vested_bps = vested_bps
                        .checked_add(tranche.basis_points as u32)
                        .ok_or(VestingError::ArithmeticOverflow)?;
                }
            }
            let vested = (schedule.total_amount as u128)
                .checked_mul(vested_bps as u128)
                .ok_or(VestingError::ArithmeticOverflow)?
                .checked_div(BPS_TOTAL as u128)
                .ok_or(VestingError::ArithmeticOverflow)?;
            u64::try_from(vested).map_err(|_| error!(VestingError::ArithmeticOverflow))
        }
        _ => err!(VestingError::InvalidScheduleKind),
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeVestingArgs {
    pub schedule_id: [u8; 32],
    pub kind: u8,
    pub start_at: i64,
    pub cliff_seconds: u64,
    pub duration_seconds: u64,
    pub deposit_amount: u64,
    pub tranches: Vec<VestingTranche>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct VestingTranche {
    pub unlock_offset_seconds: u64,
    pub basis_points: u16,
}

#[derive(Accounts)]
#[instruction(args: InitializeVestingArgs)]
pub struct InitializeVesting<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    /// CHECK: beneficiary does not need to sign when the creator locks tokens.
    pub beneficiary: UncheckedAccount<'info>,
    #[account(
        constraint = *mint.to_account_info().owner == TOKEN_2022_PROGRAM_ID @ VestingError::InvalidMintProgram
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = depositor,
        token::token_program = token_program,
    )]
    pub source: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = depositor,
        space = VestingSchedule::SPACE,
        seeds = [b"vesting", mint.key().as_ref(), beneficiary.key().as_ref(), args.schedule_id.as_ref()],
        bump
    )]
    pub schedule: Account<'info, VestingSchedule>,
    #[account(
        init,
        payer = depositor,
        seeds = [b"vesting-vault", schedule.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = schedule,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vesting", schedule.mint.as_ref(), schedule.beneficiary.as_ref(), schedule.schedule_id.as_ref()],
        bump = schedule.bump,
        has_one = beneficiary @ VestingError::UnauthorizedBeneficiary,
        has_one = mint @ VestingError::MintMismatch,
        has_one = vault @ VestingError::VaultMismatch,
    )]
    pub schedule: Account<'info, VestingSchedule>,
    #[account(
        constraint = *mint.to_account_info().owner == TOKEN_2022_PROGRAM_ID @ VestingError::InvalidMintProgram
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vesting-vault", schedule.key().as_ref()],
        bump = schedule.vault_bump,
        token::mint = mint,
        token::authority = schedule,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = beneficiary,
        token::token_program = token_program,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
pub struct VestingSchedule {
    pub depositor: Pubkey,
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub schedule_id: [u8; 32],
    pub kind: u8,
    pub start_at: i64,
    pub cliff_seconds: u64,
    pub duration_seconds: u64,
    pub requested_deposit_amount: u64,
    pub total_amount: u64,
    pub claimed_amount: u64,
    pub tranches: Vec<VestingTranche>,
    pub bump: u8,
    pub vault_bump: u8,
}
impl VestingSchedule {
    pub const SPACE: usize = 8
        + 32 + 32 + 32 + 32 + 32
        + 1 + 8 + 8 + 8 + 8 + 8 + 8
        + 4 + (MAX_TRANCHES * (8 + 2))
        + 1 + 1;
}

#[event]
pub struct VestingInitialized {
    pub schedule: Pubkey,
    pub depositor: Pubkey,
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
    pub requested_deposit_amount: u64,
    pub credited_amount: u64,
    pub kind: u8,
    pub start_at: i64,
}

#[event]
pub struct VestingClaimed {
    pub schedule: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub claimed_total: u64,
    pub vested_total: u64,
}

#[error_code]
pub enum VestingError {
    #[msg("Only SPL Token-2022 is supported")]
    InvalidTokenProgram,
    #[msg("Mint must be owned by SPL Token-2022")]
    InvalidMintProgram,
    #[msg("Deposit amount must be positive")]
    InvalidDepositAmount,
    #[msg("Token-2022 transfer credited zero spendable tokens to the vesting vault")]
    ZeroCreditedAmount,
    #[msg("Vault credit exceeded the requested transfer amount")]
    UnexpectedVaultCredit,
    #[msg("Invalid vesting schedule")]
    InvalidSchedule,
    #[msg("Invalid vesting schedule kind")]
    InvalidScheduleKind,
    #[msg("Invalid vesting start time")]
    InvalidStartTime,
    #[msg("Only the vesting beneficiary may claim")]
    UnauthorizedBeneficiary,
    #[msg("Vesting mint does not match")]
    MintMismatch,
    #[msg("Vesting vault does not match")]
    VaultMismatch,
    #[msg("No vested tokens are currently claimable")]
    NothingToClaim,
    #[msg("Vesting vault balance invariant violated")]
    VaultBalanceInvariant,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
