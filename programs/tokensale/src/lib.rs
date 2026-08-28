use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("11111111111111111111111111111111");
const POWERCHAIN_FEE_BPS:u16=200;
const BPS:u64=10_000;

#[program]
pub mod powerchain_tokensale {
    use super::*;

    pub fn initialize_sale(ctx:Context<InitializeSale>, starts_at:i64, ends_at:i64, claim_at:i64, hard_cap:u64, price_lamports_per_token:u64)->Result<()> {
        require!(hard_cap>0 && price_lamports_per_token>0, SaleError::ZeroAmount);
        require!(starts_at<ends_at && ends_at<=claim_at, SaleError::InvalidSchedule);
        let s=&mut ctx.accounts.sale;
        s.authority=ctx.accounts.authority.key();s.mint=ctx.accounts.mint.key();s.merchant=ctx.accounts.merchant.key();s.fee_treasury=ctx.accounts.fee_treasury.key();
        s.starts_at=starts_at;s.ends_at=ends_at;s.claim_at=claim_at;s.hard_cap=hard_cap;s.sold=0;s.price_lamports_per_token=price_lamports_per_token;s.service_fee_bps=POWERCHAIN_FEE_BPS;s.bump=ctx.bumps.sale;
        Ok(())
    }

    pub fn purchase(ctx:Context<Purchase>, token_amount:u64)->Result<()> {
        require!(token_amount>0, SaleError::ZeroAmount);
        let now=Clock::get()?.unix_timestamp;
        let sale=&mut ctx.accounts.sale;
        require!(now>=sale.starts_at && now<sale.ends_at, SaleError::SaleNotLive);
        let new_sold=sale.sold.checked_add(token_amount).ok_or(SaleError::MathOverflow)?;
        require!(new_sold<=sale.hard_cap, SaleError::HardCapExceeded);
        let scale=10u64.checked_pow(ctx.accounts.mint.decimals as u32).ok_or(SaleError::MathOverflow)?;
        let cost=(token_amount as u128).checked_mul(sale.price_lamports_per_token as u128).ok_or(SaleError::MathOverflow)?.checked_div(scale as u128).ok_or(SaleError::MathOverflow)? as u64;
        require!(cost>0, SaleError::ZeroAmount);
        let fee=((cost as u128).checked_mul(sale.service_fee_bps as u128).ok_or(SaleError::MathOverflow)?.checked_add((BPS-1) as u128).ok_or(SaleError::MathOverflow)?/BPS as u128) as u64;
        system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),system_program::Transfer{from:ctx.accounts.buyer.to_account_info(),to:ctx.accounts.merchant.to_account_info()}),cost)?;
        system_program::transfer(CpiContext::new(ctx.accounts.system_program.to_account_info(),system_program::Transfer{from:ctx.accounts.buyer.to_account_info(),to:ctx.accounts.fee_treasury.to_account_info()}),fee)?;
        sale.sold=new_sold;
        let a=&mut ctx.accounts.allocation;
        if a.sale==Pubkey::default(){a.sale=sale.key();a.buyer=ctx.accounts.buyer.key();a.bump=ctx.bumps.allocation;}
        require_keys_eq!(a.sale,sale.key(),SaleError::InvalidAllocation);require_keys_eq!(a.buyer,ctx.accounts.buyer.key(),SaleError::InvalidAllocation);
        a.amount=a.amount.checked_add(token_amount).ok_or(SaleError::MathOverflow)?;
        Ok(())
    }

    pub fn claim(ctx:Context<Claim>)->Result<()> {
        let now=Clock::get()?.unix_timestamp;
        let sale=&ctx.accounts.sale;
        require!(now>=sale.claim_at, SaleError::ClaimNotOpen);
        let allocation=&mut ctx.accounts.allocation;
        let amount=allocation.amount.checked_sub(allocation.claimed_amount).ok_or(SaleError::MathOverflow)?;
        require!(amount>0, SaleError::NothingToClaim);
        let authority=sale.authority;let mint=sale.mint;let bump=sale.bump;
        let seeds:&[&[u8]]=&[b"sale",authority.as_ref(),mint.as_ref(),&[bump]];
        token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),TransferChecked{from:ctx.accounts.vault.to_account_info(),mint:ctx.accounts.mint.to_account_info(),to:ctx.accounts.buyer_token.to_account_info(),authority:ctx.accounts.sale.to_account_info()},&[seeds]),amount,ctx.accounts.mint.decimals)?;
        allocation.claimed_amount=allocation.amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeSale<'info>{
    #[account(init,payer=authority,space=8+220,seeds=[b"sale",authority.key().as_ref(),mint.key().as_ref()],bump)] pub sale:Account<'info,Sale>,
    #[account(mut)] pub authority:Signer<'info>,
    pub mint:InterfaceAccount<'info,Mint>,
    /// CHECK: stored sale merchant; validated by authority at initialization
    pub merchant:UncheckedAccount<'info>,
    /// CHECK: stored PowerChain fee treasury; validated by authority at initialization
    pub fee_treasury:UncheckedAccount<'info>,
    pub system_program:Program<'info,System>
}

#[derive(Accounts)]
pub struct Purchase<'info>{
    #[account(mut)] pub buyer:Signer<'info>,
    #[account(mut,seeds=[b"sale",sale.authority.as_ref(),sale.mint.as_ref()],bump=sale.bump,has_one=mint)] pub sale:Account<'info,Sale>,
    pub mint:InterfaceAccount<'info,Mint>,
    #[account(init_if_needed,payer=buyer,space=8+96,seeds=[b"allocation",sale.key().as_ref(),buyer.key().as_ref()],bump)] pub allocation:Account<'info,Allocation>,
    /// CHECK: constrained to configured merchant
    #[account(mut,constraint=merchant.key()==sale.merchant@SaleError::InvalidMerchant)] pub merchant:UncheckedAccount<'info>,
    /// CHECK: constrained to configured fee treasury
    #[account(mut,constraint=fee_treasury.key()==sale.fee_treasury@SaleError::InvalidFeeTreasury)] pub fee_treasury:UncheckedAccount<'info>,
    pub system_program:Program<'info,System>
}

#[derive(Accounts)]
pub struct Claim<'info>{
    #[account(mut)] pub buyer:Signer<'info>,
    #[account(seeds=[b"sale",sale.authority.as_ref(),sale.mint.as_ref()],bump=sale.bump,has_one=mint)] pub sale:Account<'info,Sale>,
    #[account(mut,seeds=[b"allocation",sale.key().as_ref(),buyer.key().as_ref()],bump=allocation.bump,has_one=sale,has_one=buyer)] pub allocation:Account<'info,Allocation>,
    pub mint:InterfaceAccount<'info,Mint>,
    #[account(mut,token::mint=mint,token::authority=sale,token::token_program=token_program)] pub vault:InterfaceAccount<'info,TokenAccount>,
    #[account(init_if_needed,payer=buyer,associated_token::mint=mint,associated_token::authority=buyer,associated_token::token_program=token_program)] pub buyer_token:InterfaceAccount<'info,TokenAccount>,
    pub token_program:Interface<'info,TokenInterface>,pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>
}

#[account] pub struct Sale{pub authority:Pubkey,pub mint:Pubkey,pub merchant:Pubkey,pub fee_treasury:Pubkey,pub starts_at:i64,pub ends_at:i64,pub claim_at:i64,pub hard_cap:u64,pub sold:u64,pub price_lamports_per_token:u64,pub service_fee_bps:u16,pub bump:u8}
#[account] pub struct Allocation{pub sale:Pubkey,pub buyer:Pubkey,pub amount:u64,pub claimed_amount:u64,pub bump:u8}
#[error_code] pub enum SaleError{#[msg("Amount must be greater than zero")]ZeroAmount,#[msg("Invalid sale schedule")]InvalidSchedule,#[msg("Sale is not live")]SaleNotLive,#[msg("Sale hard cap exceeded")]HardCapExceeded,#[msg("Claim is not open")]ClaimNotOpen,#[msg("Nothing to claim")]NothingToClaim,#[msg("Arithmetic overflow")]MathOverflow,#[msg("Invalid allocation")]InvalidAllocation,#[msg("Invalid merchant")]InvalidMerchant,#[msg("Invalid fee treasury")]InvalidFeeTreasury}
