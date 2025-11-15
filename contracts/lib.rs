#![cfg_attr(not(feature = "std"), no_std, no_main)]

/// X402 Payment Executor Smart Contract
///
/// This contract executes signed payment authorizations for the X402 protocol on Polkadot.
/// It verifies signatures, prevents replay attacks, and executes transfers.
#[ink::contract]
mod x402_payment_executor {
    use ink::prelude::string::String;
    use ink::prelude::vec::Vec;
    use ink::storage::Mapping;

    /// Payment payload structure matching the TypeScript SDK
    #[derive(Debug, Clone, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct PaymentPayload {
        pub from: AccountId,
        pub to: AccountId,
        pub amount: Balance,
        pub nonce: String,
        pub valid_until: u64,
    }

    /// Payment execution result
    #[derive(Debug, Clone, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct PaymentResult {
        pub success: bool,
        pub block_number: u32,
        pub nonce: String,
    }

    /// Errors that can occur during payment execution
    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        /// Payment signature is invalid
        InvalidSignature,
        /// Payment has expired
        PaymentExpired,
        /// Nonce has already been used (replay attack)
        NonceAlreadyUsed,
        /// Insufficient balance to execute payment
        InsufficientBalance,
        /// Transfer failed
        TransferFailed,
        /// Invalid recipient
        InvalidRecipient,
        /// Payment amount is zero
        ZeroAmount,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    /// X402 Payment Executor Contract Storage
    #[ink(storage)]
    pub struct X402PaymentExecutor {
        /// Mapping of used nonces to prevent replay attacks
        /// Key: hash(from_address + nonce) -> bool
        used_nonces: Mapping<[u8; 32], bool>,
        /// Contract owner (for administrative functions)
        owner: AccountId,
        /// Fee charged by the facilitator (in percentage, e.g., 100 = 1%)
        facilitator_fee_bps: u16, // basis points (1/100th of a percent)
    }

    /// Events emitted by the contract
    #[ink(event)]
    pub struct PaymentExecuted {
        #[ink(topic)]
        from: AccountId,
        #[ink(topic)]
        to: AccountId,
        amount: Balance,
        facilitator_fee: Balance,
        nonce: String,
        block_number: u32,
    }

    #[ink(event)]
    pub struct PaymentFailed {
        #[ink(topic)]
        from: AccountId,
        nonce: String,
        reason: String,
    }

    impl X402PaymentExecutor {
        /// Constructor - creates a new X402 Payment Executor contract
        #[ink(constructor)]
        pub fn new(facilitator_fee_bps: u16) -> Self {
            Self {
                used_nonces: Mapping::default(),
                owner: Self::env().caller(),
                facilitator_fee_bps,
            }
        }

        /// Execute a signed payment authorization
        ///
        /// # Arguments
        /// * `payload_json` - JSON string of the payment payload
        /// * `signature` - Signature bytes (64 bytes for sr25519)
        ///
        /// # Returns
        /// Result with PaymentResult or Error
        #[ink(message, payable)]
        pub fn execute_payment(
            &mut self,
            from: AccountId,
            to: AccountId,
            amount: Balance,
            nonce: String,
            valid_until: u64,
            signature: Vec<u8>,
        ) -> Result<PaymentResult> {
            // 1. Check if payment has expired
            let current_time = self.env().block_timestamp();
            if current_time > valid_until {
                self.emit_payment_failed(from, nonce.clone(), "Payment expired".into());
                return Err(Error::PaymentExpired);
            }

            // 2. Check if nonce has been used (prevent replay attacks)
            let nonce_hash = self.compute_nonce_hash(&from, &nonce);
            if self.used_nonces.get(nonce_hash).unwrap_or(false) {
                self.emit_payment_failed(from, nonce.clone(), "Nonce already used".into());
                return Err(Error::NonceAlreadyUsed);
            }

            // 3. Verify signature
            if !self.verify_signature(from, to, amount, &nonce, valid_until, &signature) {
                self.emit_payment_failed(from, nonce.clone(), "Invalid signature".into());
                return Err(Error::InvalidSignature);
            }

            // 4. Validate amount
            if amount == 0 {
                return Err(Error::ZeroAmount);
            }

            // 5. Calculate facilitator fee
            let facilitator_fee = amount
                .checked_mul(self.facilitator_fee_bps as u128)
                .and_then(|v| v.checked_div(10000))
                .ok_or(Error::InsufficientBalance)?;
            let net_amount = amount.checked_sub(facilitator_fee)
                .ok_or(Error::InsufficientBalance)?;

            // 6. Mark nonce as used BEFORE transfer (prevent reentrancy)
            self.used_nonces.insert(nonce_hash, &true);

            // 7. Execute transfer from this contract to recipient
            // Note: The payer needs to have approved this contract to spend their tokens
            // OR the payer sends tokens to this contract first
            if self.env().transfer(to, net_amount).is_err() {
                self.emit_payment_failed(from, nonce.clone(), "Transfer failed".into());
                return Err(Error::TransferFailed);
            }

            // 8. Transfer fee to facilitator (contract owner)
            if facilitator_fee > 0 {
                let _ = self.env().transfer(self.owner, facilitator_fee);
            }

            // 9. Emit success event
            let block_number = self.env().block_number();
            self.env().emit_event(PaymentExecuted {
                from,
                to,
                amount: net_amount,
                facilitator_fee,
                nonce: nonce.clone(),
                block_number,
            });

            Ok(PaymentResult {
                success: true,
                block_number,
                nonce,
            })
        }

        /// Check if a nonce has been used
        #[ink(message)]
        pub fn is_nonce_used(&self, from: AccountId, nonce: String) -> bool {
            let nonce_hash = self.compute_nonce_hash(&from, &nonce);
            self.used_nonces.get(nonce_hash).unwrap_or(false)
        }

        /// Get the facilitator fee in basis points
        #[ink(message)]
        pub fn get_facilitator_fee(&self) -> u16 {
            self.facilitator_fee_bps
        }

        /// Update facilitator fee (only owner)
        #[ink(message)]
        pub fn set_facilitator_fee(&mut self, fee_bps: u16) -> Result<()> {
            if self.env().caller() != self.owner {
                return Err(Error::InvalidRecipient);
            }
            self.facilitator_fee_bps = fee_bps;
            Ok(())
        }

        /// Get contract owner
        #[ink(message)]
        pub fn get_owner(&self) -> AccountId {
            self.owner
        }

        // Private helper functions

        /// Compute a unique hash for the nonce
        fn compute_nonce_hash(&self, from: &AccountId, nonce: &String) -> [u8; 32] {
            let mut data = Vec::new();
            data.extend_from_slice(from.as_ref());
            data.extend_from_slice(nonce.as_bytes());

            // Use keccak256 for hashing
            let mut output = [0u8; 32];
            ink::env::hash_bytes::<ink::env::hash::Keccak256>(&data, &mut output);
            output
        }

        /// Emit a payment failed event
        fn emit_payment_failed(&self, from: AccountId, nonce: String, reason: String) {
            self.env().emit_event(PaymentFailed {
                from,
                nonce,
                reason,
            });
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

            // Hash the message using Blake2x256 (standard for Substrate)
            let mut hash = [0u8; 32];
            ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&message, &mut hash);

            // Verify the sr25519 signature
            // signature should be 64 bytes, from should be the public key (32 bytes)
            if signature.len() != 64 {
                return false;
            }

            ink::env::sr25519_verify(signature, &hash, &from).is_ok()
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn new_works() {
            let contract = X402PaymentExecutor::new(100); // 1% fee
            assert_eq!(contract.get_facilitator_fee(), 100);
        }

        #[ink::test]
        fn nonce_tracking_works() {
            let mut contract = X402PaymentExecutor::new(100);
            let account = AccountId::from([0x01; 32]);
            let nonce = String::from("test-nonce-123");

            assert!(!contract.is_nonce_used(account, nonce.clone()));

            // After using, it should be marked
            let nonce_hash = contract.compute_nonce_hash(&account, &nonce);
            contract.used_nonces.insert(nonce_hash, &true);

            assert!(contract.is_nonce_used(account, nonce));
        }
    }
}
