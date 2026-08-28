use anchor_lang::prelude::*;
declare_id!("11111111111111111111111111111111");
#[program] pub mod powerchain_factory { use super::*; pub fn register_sale(ctx:Context<RegisterSale>, sale:Pubkey)->Result<()> { require!(sale != Pubkey::default(), FactoryError::InvalidSale); ctx.accounts.registry.sale=sale;ctx.accounts.registry.authority=ctx.accounts.authority.key();Ok(()) } }
#[derive(Accounts)] pub struct RegisterSale<'info>{#[account(init,payer=authority,space=8+64)]pub registry:Account<'info,Registry>,#[account(mut)]pub authority:Signer<'info>,pub system_program:Program<'info,System>}
#[account] pub struct Registry{pub sale:Pubkey,pub authority:Pubkey}
#[error_code] pub enum FactoryError{#[msg("Invalid sale address")]InvalidSale}
