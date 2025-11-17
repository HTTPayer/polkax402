#![cfg_attr(not(feature = "std"), no_std, no_main)]

/// httpusd - PSP22 Token with X402 transfer_with_authorization support
///
/// This is a standalone PSP22 token with X402 functionality
/// allowing gasless, signature-based payment authorizations.
#[ink::contract]
mod httpusd {
    use ink::prelude::string::String;
    use ink::prelude::vec::Vec;
    use ink::storage::Mapping;

    /// PSP22 error types
    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    #[allow(clippy::cast_possible_truncation)]
    pub enum PSP22Error {
        Custom(String),
        InsufficientBalance,
        InsufficientAllowance,
        ZeroRecipientAddress,
        ZeroSenderAddress,
    }

    /// X402-specific errors
    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    #[allow(clippy::cast_possible_truncation)]
    pub enum Error {
        /// PSP22 error wrapper
        PSP22(PSP22Error),
        /// Payment signature is invalid
        InvalidSignature,
        /// Payment has expired
        PaymentExpired,
        /// Nonce has already been used (replay attack)
        NonceAlreadyUsed,
        /// Transfer failed
        TransferFailed,
    }

    impl From<PSP22Error> for Error {
        fn from(e: PSP22Error) -> Self {
            Error::PSP22(e)
        }
    }

    pub type Result<T> = core::result::Result<T, Error>;

    /// httpusd Storage
    #[ink(storage)]
    pub struct Httpusd {
        /// Total supply of httpusd
        total_supply: Balance,
        /// Token balances
        balances: Mapping<AccountId, Balance>,
        /// Allowances for PSP22 transfers
        allowances: Mapping<(AccountId, AccountId), Balance>,
        /// Used nonces for X402 (prevents replay attacks)
        used_nonces: Mapping<[u8; 32], bool>,
        /// Contract owner
        owner: AccountId,
        /// Facilitator fee in basis points (e.g., 100 = 1%)
        facilitator_fee_bps: u16,
    }

    /// Events
    #[ink(event)]
    pub struct Transfer {
        #[ink(topic)]
        from: Option<AccountId>,
        #[ink(topic)]
        to: Option<AccountId>,
        value: Balance,
    }

    #[ink(event)]
    pub struct Approval {
        #[ink(topic)]
        owner: AccountId,
        #[ink(topic)]
        spender: AccountId,
        value: Balance,
    }

    #[ink(event)]
    pub struct DebugSignature {
        message_hash: [u8; 32],
        signature_valid: bool,
        signature_len: u32,
    }

    #[ink(event)]
    pub struct TransferWithAuthorization {
        #[ink(topic)]
        from: AccountId,
        #[ink(topic)]
        to: AccountId,
        amount: Balance,
        facilitator_fee: Balance,
        nonce: String,
    }

    impl Httpusd {
        /// Constructor
        #[ink(constructor)]
        pub fn new(initial_supply: Balance, facilitator_fee_bps: u16) -> Self {
            let caller = Self::env().caller();
            let mut balances = Mapping::default();
            balances.insert(caller, &initial_supply);

            Self {
                total_supply: initial_supply,
                balances,
                allowances: Mapping::default(),
                used_nonces: Mapping::default(),
                owner: caller,
                facilitator_fee_bps,
            }
        }

        // ============================================================
        // PSP22 STANDARD FUNCTIONS
        // ============================================================

        /// Returns the total supply
        #[ink(message)]
        pub fn total_supply(&self) -> Balance {
            self.total_supply
        }

        /// Returns the number of decimals for the token
        #[ink(message)]
        pub fn decimals(&self) -> u8 {
            12
        }

        /// Returns the balance of an account
        #[ink(message)]
        pub fn balance_of(&self, owner: AccountId) -> Balance {
            self.balances.get(owner).unwrap_or(0)
        }

        /// Returns the allowance
        #[ink(message)]
        pub fn allowance(&self, owner: AccountId, spender: AccountId) -> Balance {
            self.allowances.get((owner, spender)).unwrap_or(0)
        }

        /// Standard PSP22 transfer
        #[ink(message)]
        pub fn transfer(&mut self, to: AccountId, value: Balance) -> Result<()> {
            let from = self.env().caller();
            self.transfer_from_to(from, to, value)?;
            Ok(())
        }

        /// Approve spender to spend tokens
        #[ink(message)]
        pub fn approve(&mut self, spender: AccountId, value: Balance) -> Result<()> {
            let owner = self.env().caller();
            self.allowances.insert((owner, spender), &value);
            self.env().emit_event(Approval { owner, spender, value });
            Ok(())
        }

        /// Transfer from another account (requires allowance)
        #[ink(message)]
        pub fn transfer_from(
            &mut self,
            from: AccountId,
            to: AccountId,
            value: Balance,
        ) -> Result<()> {
            let caller = self.env().caller();
            let allowance = self.allowance(from, caller);

            if allowance < value {
                return Err(Error::PSP22(PSP22Error::InsufficientAllowance));
            }

            let new_allowance = allowance.checked_sub(value)
                .ok_or(Error::PSP22(PSP22Error::InsufficientAllowance))?;
            self.allowances.insert((from, caller), &new_allowance);
            self.transfer_from_to(from, to, value)?;
            Ok(())
        }

        // ============================================================
        // X402 TRANSFER WITH AUTHORIZATION
        // ============================================================

        /// Execute a signed payment authorization (X402)
        ///
        /// # Arguments
        /// * `from` - Account that signed the authorization
        /// * `to` - Recipient account
        /// * `amount` - Amount to transfer (before fees)
        /// * `valid_until` - Timestamp when authorization expires
        /// * `nonce` - Unique nonce string to prevent replay
        /// * `signature` - sr25519 signature (64 bytes)
        ///
        /// # Returns
        /// Result with () or Error
        #[ink(message)]
        pub fn transfer_with_authorization(
            &mut self,
            from: AccountId,
            to: AccountId,
            amount: Balance,
            valid_until: u64,
            nonce: String,
            signature: Vec<u8>,
        ) -> Result<()> {
            // 1. Check if payment has expired
            let current_time = self.env().block_timestamp();
            if current_time > valid_until {
                return Err(Error::PaymentExpired);
            }

            // 2. Check if nonce has been used (prevent replay attacks)
            let nonce_hash = self.compute_nonce_hash(&from, &nonce);
            if self.used_nonces.get(nonce_hash).unwrap_or(false) {
                return Err(Error::NonceAlreadyUsed);
            }

            // 3. Verify signature
            if !self.verify_signature(from, to, amount, &nonce, valid_until, &signature) {
                return Err(Error::InvalidSignature);
            }

            // 4. Validate amount
            if amount == 0 {
                return Err(Error::PSP22(PSP22Error::InsufficientBalance));
            }

            // 5. Calculate facilitator fee
            let facilitator_fee = amount
                .checked_mul(self.facilitator_fee_bps as u128)
                .and_then(|v| v.checked_div(10000))
                .ok_or(Error::PSP22(PSP22Error::InsufficientBalance))?;

            let net_amount = amount
                .checked_sub(facilitator_fee)
                .ok_or(Error::PSP22(PSP22Error::InsufficientBalance))?;

            // 6. Mark nonce as used BEFORE transfer (prevent reentrancy)
            self.used_nonces.insert(nonce_hash, &true);

            // 7. Execute transfer from 'from' to 'to'
            self.transfer_from_to(from, to, net_amount)?;

            // 8. Transfer fee to facilitator (caller/owner)
            if facilitator_fee > 0 {
                let _ = self.transfer_from_to(from, self.owner, facilitator_fee);
            }

            // 9. Emit event
            self.env().emit_event(TransferWithAuthorization {
                from,
                to,
                amount: net_amount,
                facilitator_fee,
                nonce,
            });

            Ok(())
        }

        /// Check if a nonce has been used
        #[ink(message)]
        pub fn is_nonce_used(&self, from: AccountId, nonce: String) -> bool {
            let nonce_hash = self.compute_nonce_hash(&from, &nonce);
            self.used_nonces.get(nonce_hash).unwrap_or(false)
        }

        // ============================================================
        // ADMIN FUNCTIONS
        // ============================================================

        /// Get the facilitator fee in basis points
        #[ink(message)]
        pub fn get_facilitator_fee(&self) -> u16 {
            self.facilitator_fee_bps
        }

        /// Update facilitator fee (only owner)
        #[ink(message)]
        pub fn set_facilitator_fee(&mut self, fee_bps: u16) -> Result<()> {
            if self.env().caller() != self.owner {
                return Err(Error::PSP22(PSP22Error::Custom(String::from("Not owner"))));
            }
            self.facilitator_fee_bps = fee_bps;
            Ok(())
        }

        // ============================================================
        // PRIVATE HELPER FUNCTIONS
        // ============================================================

        /// Internal transfer helper
        fn transfer_from_to(&mut self, from: AccountId, to: AccountId, value: Balance) -> Result<()> {
            let from_balance = self.balance_of(from);
            if from_balance < value {
                return Err(Error::PSP22(PSP22Error::InsufficientBalance));
            }

            let new_from_balance = from_balance.checked_sub(value)
                .ok_or(Error::PSP22(PSP22Error::InsufficientBalance))?;
            self.balances.insert(from, &new_from_balance);

            let to_balance = self.balance_of(to);
            let new_to_balance = to_balance.checked_add(value)
                .ok_or(Error::PSP22(PSP22Error::Custom(String::from("Overflow"))))?;
            self.balances.insert(to, &new_to_balance);

            self.env().emit_event(Transfer {
                from: Some(from),
                to: Some(to),
                value,
            });

            Ok(())
        }

        /// Compute a unique hash for the nonce
        fn compute_nonce_hash(&self, from: &AccountId, nonce: &String) -> [u8; 32] {
            let mut data = Vec::new();
            data.extend_from_slice(from.as_ref());
            data.extend_from_slice(nonce.as_bytes());

            let mut output = [0u8; 32];
            ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&data, &mut output);
            output
        }

        /// Verify sr25519 signature for the payment
        fn verify_signature(
            &self,
            from: AccountId,
            to: AccountId,
            amount: Balance,
            nonce: &String,
            valid_until: u64,
            signature: &[u8],
        ) -> bool {
            // Build the message that was signed
            use scale::Encode;
            let mut message = Vec::new();
            message.extend_from_slice(&from.encode());
            message.extend_from_slice(&to.encode());
            message.extend_from_slice(&amount.encode());
            message.extend_from_slice(nonce.as_bytes());
            message.extend_from_slice(&valid_until.encode());

            // Hash the message using Blake2x256
            let mut hash = [0u8; 32];
            ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&message, &mut hash);

            // Verify the sr25519 signature
            let sig_len = signature.len();
            if sig_len != 64 {
                #[allow(clippy::cast_possible_truncation)]
                self.env().emit_event(DebugSignature {
                    message_hash: hash,
                    signature_valid: false,
                    signature_len: sig_len as u32,
                });
                return false;
            }

            // Convert signature slice to fixed array
            let mut sig_array = [0u8; 64];
            sig_array.copy_from_slice(signature);

            // Convert AccountId to public key bytes
            let pub_key: &[u8; 32] = from.as_ref();

            let is_valid = ink::env::sr25519_verify(&sig_array, &hash, pub_key).is_ok();

            #[allow(clippy::cast_possible_truncation)]
            self.env().emit_event(DebugSignature {
                message_hash: hash,
                signature_valid: is_valid,
                signature_len: sig_len as u32,
            });

            is_valid
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn new_works() {
            let initial_supply = 1_000_000_000_000; // 1 trillion
            let contract = Httpusd::new(initial_supply, 100); // 1% fee
            assert_eq!(contract.total_supply(), initial_supply);
            assert_eq!(contract.get_facilitator_fee(), 100);
        }

        #[ink::test]
        fn nonce_tracking_works() {
            let initial_supply = 1_000_000_000_000;
            let mut contract = Httpusd::new(initial_supply, 100);
            let account = AccountId::from([0x02; 32]);
            let nonce = String::from("test-nonce-123");

            assert!(!contract.is_nonce_used(account, nonce.clone()));

            let nonce_hash = contract.compute_nonce_hash(&account, &nonce);
            contract.used_nonces.insert(nonce_hash, &true);

            assert!(contract.is_nonce_used(account, nonce));
        }
    }
}
