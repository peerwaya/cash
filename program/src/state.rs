use borsh::{BorshDeserialize, BorshSerialize, BorshSchema};

pub mod cashlink;
pub mod redemption;

pub const FLAG_ACCOUNT_SIZE: usize = 1;
pub const FINGERPRINT_PREFIX: &'static str = "fingerprint";
/// Enum representing the account type managed by the program
#[derive(Clone, Debug, PartialEq, Eq, BorshDeserialize, BorshSerialize, BorshSchema)]
pub enum AccountType {
    /// If the account has not been initialized, the enum will be 0
    Uninitialized,
    /// A cashlink account type
    CashLink,
    /// A redemption account type
    Redemption,
}

impl Default for AccountType {
    fn default() -> Self {
        AccountType::Uninitialized
    }
}