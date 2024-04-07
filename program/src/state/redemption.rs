use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    borsh0_10::try_from_slice_unchecked,
    msg,
    program_error::ProgramError,
    program_pack::{Pack, Sealed}, pubkey::Pubkey,
};

use super::AccountType;

pub const REDEMPTION_SIZE: usize = 81;

#[repr(C)]
#[derive(Debug, Clone, PartialEq, BorshSerialize, BorshDeserialize, Default)]
pub struct Redemption {
    pub account_type: AccountType,
    pub cash_link: Pubkey,
    pub wallet: Pubkey,
    pub redeemed_at: u64,
    pub amount: u64
}

impl Redemption {
    pub const PREFIX: &'static str = "redeem";
}


impl Sealed for Redemption {}

impl Pack for Redemption {
    const LEN: usize = REDEMPTION_SIZE;

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let mut slice = dst;
        self.serialize(&mut slice).unwrap()
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        if src.len() != Self::LEN
        {
            msg!("Failed to deserialize");
            return Err(ProgramError::InvalidAccountData);
        }

        let result: Self = try_from_slice_unchecked(src)?;

        Ok(result)
    }
}