//! Instruction types
#![allow(missing_docs)]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program, sysvar,
};
use spl_associated_token_account::get_associated_token_address;

use crate::state::cashlink::DistributionType;

/// Initialize a cash_link arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash_link params
pub struct InitCashLinkArgs {
    pub amount: u64,
    pub fee_bps: u16,
    pub fixed_fee: u64,
    pub fee_to_redeem: u64,
    pub cash_link_bump: u8,
    pub distribution_type: DistributionType,
    pub max_num_redemptions: u16,
    pub min_amount: Option<u64>,
    pub fingerprint_enabled: Option<bool>,
    pub num_days_to_expire: u8,
}

/// Initialize a redemption arguments
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Initialize a cash_link params
pub struct InitCashRedemptionArgs {
    pub redemption_bump: u8,
    pub cash_link_bump: u8,
    pub fingerprint: Option<String>,
    pub fingerprint_bump: Option<u8>,
}

/// Cancel a cash link
#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
/// Cancel a cash_link params
pub struct CancelCashRedemptionArgs {
    pub cash_link_bump: u8,
}

#[repr(C)]
#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq, Clone,)]
pub enum CashInstruction {

    /// Starts the trade by creating and populating an cash_link account and transferring ownership of the given temp token account to the PDA
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]`   The cash_link authority responsible for approving / refunding payments due to some external conditions
    /// 1. `[signer][writable]`The account of the wallet owner initializing the cashlink
    /// 2. `[signer]`   The fee payer
    /// 3. `[writable]` The cash link account, it will hold all necessary info about the trade.
    /// 4. `[]` The pass key required to unlock the cash link for redemption
    /// 5. `[]` The rent sysvar
    /// 6. `[]` The system program
    /// 7. `[]` The clock account
    /// 8. `[]` The token mint (Optional)
    /// 9. `[writable]` The associated token for the mint derived from the cash link account (Optional)
    /// 10. `[writable]` The owner token that must be passed if pay is true and mint is some Optional)
    /// 11. `[]` The token program
    InitCashLink (InitCashLinkArgs),
    /// Redeem the cashlink
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[signer]` The user wallet
    /// 2. `[writable]` The fee token account for the token they will receive should the trade go through
    /// 3. `[writable]` The cash_link account holding the cash_link info
    /// 4. `[]` The pass key required to unlock the cash link for redemption
    /// 5. `[writable]` The redemption account to flag a user has redeemed this cashlink
    /// 6. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 7. `[writable]` The fee payer token account to receive tokens from the vault
    /// 8. `[]` The clock account
    /// 9. `[]` The rent account
    /// 10. `[]` The recent slot hash account
    /// 11. `[writable][Optional]` The vault token account to get tokens. This value is Optional. if the mint is set, then this must be set.
    /// 12. `[writable][Optional]` The recipient token account for the token they will receive should the trade go through
    /// 13. `[][Optional]` The mint account for the token
    /// 14. `[]` The system program
    /// 15. `[writable][Optional]` The fingerprint info
    /// 16. `[]` The token program
    Redeem(InitCashRedemptionArgs),
    /// Cancel the cash_link
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash_link account holding the cash_link info   
    /// 2. `[]` The pass key required to unlock the cash link for redemption
    /// 3. `[writable]` The payer token account of the payer that initialized the cash_link  
    /// 4. `[writable]` The fee payer token account to receive tokens from the vault
    /// 5. `[]` The clock account
    /// 6. `[]` The rent account
    /// 7. `[writable]` The vault token account to get tokens from and eventually close. This value is Optional. if the mint is set, then this must be set.
    /// 8. `[]` The token program
    /// 9. `[]` The system program
    Cancel(CancelCashRedemptionArgs),
    /// Close the cash_link
    ///
    ///
    /// Accounts expected:
    ///
    /// 0. `[signer]` The account of the authority
    /// 1. `[writable]` The cash_link account holding the cash_link info     
    /// 2. `[writable]` The fee payer's main account to send their rent fees to
    Close,
}

/// Create `InitCashLink` instruction
pub fn init_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    owner: &Pubkey,
    fee_payer: &Pubkey,
    cash_link_pda: &Pubkey,
    pass_key: &Pubkey,
    mint: Option<&Pubkey>,
    args: InitCashLinkArgs,
) -> Instruction {
    let owner_key = if mint.is_some() {
        AccountMeta::new_readonly(*owner, true)
    } else {
        AccountMeta::new(*owner, true)
    };
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        owner_key,
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new(*cash_link_pda, false),
        AccountMeta::new_readonly(*pass_key, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
    ];
    if let Some(key) = mint {
        let associated_token_account = get_associated_token_address(cash_link_pda, &key);
        accounts.push(AccountMeta::new_readonly(*key, false));
        accounts.push(AccountMeta::new(associated_token_account, false));
        let owner_token_account = get_associated_token_address(owner, &key);
        accounts.push(AccountMeta::new(owner_token_account, false));
        accounts.push(AccountMeta::new_readonly(spl_associated_token_account::id(), false),);
        accounts.push(AccountMeta::new(spl_token::id(), false));
    }
    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::InitCashLink(args),
        accounts,
    )
}

/// Create `CancelCashLink` instruction
pub fn cancel_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    cash_link: &Pubkey,
    pass_key: &Pubkey,
    owner_token: &Pubkey,
    vault_token: Option<&Pubkey>,
    fee_payer: &Pubkey,
    args: CancelCashRedemptionArgs,
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new_readonly(*pass_key, false),
        AccountMeta::new(*owner_token, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
    ];

    if let Some(key) = vault_token {
        accounts.push(AccountMeta::new(*key, false));
    }

    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new_readonly(system_program::id(), false));

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Cancel(args),
        accounts,
    )
}

/// Create `RedeemCashLink` instruction
pub fn redeem_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    wallet: &Pubkey,
    wallet_token: &Pubkey,
    collection_fee_token: &Pubkey,
    vault_token: Option<&Pubkey>,
    cash_link: &Pubkey,
    pass_key: &Pubkey,
    redemption_pda: &Pubkey,
    owner_token: &Pubkey,
    fee_payer: &Pubkey,
    fingerprint: Option<&Pubkey>,
    mint: &Pubkey,
    args: InitCashRedemptionArgs
) -> Instruction {
    let mut accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*wallet, true),
        AccountMeta::new(*collection_fee_token, false),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new_readonly(*pass_key, false),
        AccountMeta::new(*redemption_pda, false),
        AccountMeta::new(*owner_token, false),
        AccountMeta::new(*fee_payer, true),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(sysvar::slot_hashes::id(), false),
    ];

    if let Some(key) = vault_token {
        accounts.push(AccountMeta::new(*wallet_token, false));
        accounts.push(AccountMeta::new(*key, false));
        AccountMeta::new_readonly(*mint, false);
    }
    accounts.push(AccountMeta::new_readonly(system_program::id(), false));
    if let Some(fingerprint_id) = fingerprint {
        accounts.push(AccountMeta::new(*fingerprint_id, false));
    }
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Redeem(args),
        accounts,
    )
}

/// Create `CloseCashLink` instruction
pub fn close_cash_link(
    program_id: &Pubkey,
    authority: &Pubkey,
    cash_link: &Pubkey,
    fee_payer: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new(*cash_link, false),
        AccountMeta::new(*fee_payer, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];

    Instruction::new_with_borsh(
        *program_id,
        &CashInstruction::Close,
        accounts,
    )
}