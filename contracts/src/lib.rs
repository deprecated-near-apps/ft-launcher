
/**
* Fungible Token NEP-141 Token contract
*
* The aim of the contract is to provide a basic implementation of the improved function token standard.
*
* lib.rs is the main entry point.
* fungible_token_core.rs implements NEP-146 standard
* storage_manager.rs implements NEP-145 standard for allocating storage per account
* fungible_token_metadata.rs implements NEP-148 standard for providing token-specific metadata.
* internal.rs contains internal methods for fungible token.
*/
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U128, ValidAccountId, Base58PublicKey};
use near_sdk::{env, ext_contract, near_bindgen, AccountId, PublicKey, Balance, Promise, PromiseResult, StorageUsage};

pub use crate::fungible_token_core::*;
pub use crate::fungible_token_metadata::*;
use crate::internal::*;
pub use crate::storage_manager::*;
use std::num::ParseIntError;
use std::convert::TryInto;

mod fungible_token_core;
mod fungible_token_metadata;
mod internal;
mod storage_manager;

const ON_CREATE_ACCOUNT_CALLBACK_GAS: u64 = 20_000_000_000_000;
const ACCESS_KEY_ALLOWANCE: u128 = 100_000_000_000_000_000_000_000;
const SPONSOR_FEE: u128 = 100_000_000_000_000_000_000_000;
const FUNDING_AMOUNT: u128 = 500_000_000_000_000_000_000_000;
const NO_DEPOSIT: Balance = 0;
/// 100 tokens if 24decimals (like NEAR)
const DROP_DEFAULT: u128 = 100_000_000_000_000_000_000_000_000;

#[global_allocator]
static ALLOC: near_sdk::wee_alloc::WeeAlloc<'_> = near_sdk::wee_alloc::WeeAlloc::INIT;

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct Contract {
    pub owner_id: AccountId,
    pub drop_amount: Balance,
    
    /// PublicKey -> AccountId.
    pub guests: LookupMap<PublicKey, AccountId>,

    /// AccountID -> Account balance.
    pub accounts: LookupMap<AccountId, Balance>,

    /// Total supply of the all token.
    pub total_supply: Balance,

    /// The storage size in bytes for one account.
    pub account_storage_usage: StorageUsage,

    pub ft_metadata: FungibleTokenMetadata
}

impl Default for Contract {
    fn default() -> Self {
        env::panic(b"Contract is not initialized");
    }
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(owner_id: ValidAccountId, total_supply: U128, version: String, name: String, symbol: String, reference: String, reference_hash: String, decimals: u8) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        let ref_hash_result: Result<Vec<u8>, ParseIntError> = (0..reference_hash.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&reference_hash[i..i + 2], 16))
            .collect();
        let ref_hash_fixed_bytes: [u8; 32] = ref_hash_result.unwrap().as_slice().try_into().unwrap();

        let mut this = Self {
            owner_id: owner_id.clone().into(),
            drop_amount: DROP_DEFAULT,
            guests: LookupMap::new(b"g".to_vec()),
            accounts: LookupMap::new(b"a".to_vec()),
            total_supply: total_supply.into(),
            account_storage_usage: 0,
            ft_metadata: FungibleTokenMetadata {
                version,
                name,
                symbol,
                reference,
                reference_hash: ref_hash_fixed_bytes,
                decimals
            }
        };
        // Determine cost of insertion into LookupMap
        let initial_storage_usage = env::storage_usage();
        let tmp_account_id = unsafe { String::from_utf8_unchecked(vec![b'a'; 64]) };
        this.accounts.insert(&tmp_account_id, &0u128);
        this.account_storage_usage = env::storage_usage() - initial_storage_usage;
        this.accounts.remove(&tmp_account_id);
        // Make owner have total supply
        let total_supply_u128: u128 = total_supply.into();
        this.accounts.insert(&owner_id.as_ref(), &total_supply_u128);
        this
    }

    /// Custom Methods for Social Token Drops

    /// looks for guest key in custom guests.CONTRACT_ACCOUNT_ID sub account
    pub fn get_predecessor(&mut self) -> AccountId {
        let predecessor = env::predecessor_account_id();
        let (first, last) = predecessor.split_once(".").unwrap();
        if first == "guests" && last == self.owner_id {
            self.guests.get(&env::signer_account_pk()).expect("not a guest")
        } else {
            predecessor
        }
    }

    /// add account_id to guests for get_predecessor and to storage to receive tokens
    /// only the owner / backend API should be able to do this to avoid unwanted storage usage in creating new guest records
    pub fn add_guest(&mut self, account_id: AccountId, public_key: Base58PublicKey) {
        assert!(env::predecessor_account_id() == self.owner_id, "must be owner_id");
        if self.accounts.insert(&account_id, &0).is_some() {
            env::panic(b"The account is already registered");
        }
        if self.guests.insert(&public_key.into(), &account_id).is_some() {
            env::panic(b"guest account already added");
        }
    }

    pub fn update_drop_amount(&mut self, amount: U128) {
        assert!(env::predecessor_account_id() == self.owner_id, "must be owner_id");
        self.drop_amount = amount.into();
    }

    /// transfer doesn't require 1 yocto - guests do not have NEAR
    pub fn ft_transfer_guest(&mut self, receiver_id: ValidAccountId, amount: U128, memo: Option<String>) {
        let sender_id:ValidAccountId = self.get_predecessor().try_into().unwrap();
        let amount = amount.into();
        let balance = self.ft_balance_of(sender_id.clone()).into();


        env::log(
            format!(
                "Balance {} Amount {} Sender {:?}",
                balance, amount, sender_id.clone()
            )
            .as_bytes(),
        );
        

        assert!(amount < balance, "cannot transfer max balance");
        self.internal_transfer(&sender_id.into(), receiver_id.as_ref(), amount, memo);
    }

    pub fn claim_drop(&mut self) {
        let receiver_id:ValidAccountId = self.guests.get(&env::signer_account_pk()).expect("not a guest").try_into().unwrap();
        let balance:u128 = self.ft_balance_of(receiver_id.clone()).into();
        assert!(balance == 0, "already claimed");
        let amount = self.drop_amount.into();
        self.internal_transfer(&self.owner_id.clone().into(), &receiver_id.into(), amount, None);
    }
    
    /// 
    pub fn remove_guest(&mut self, public_key: Base58PublicKey) {
        assert!(env::predecessor_account_id() == self.owner_id, "must be owner_id");
        let account_id = self.guests.get(&public_key.clone().into()).expect("not a guest");
        let amount = self.accounts.get(&account_id).unwrap_or(0);
        self.internal_transfer(&account_id, &self.owner_id.clone().into(), amount, None);
        self.accounts.remove(&account_id);
        self.guests.remove(&public_key.into());
    }

    /// user wants to become a real NEAR account
    pub fn upgrade_guest(&mut self,
        public_key: Base58PublicKey,
        access_key: Base58PublicKey,
        method_names: String
    ) -> Promise {
        let pk = env::signer_account_pk();
        let account_id = self.guests.get(&pk).expect("not a guest");
        let amount = self.accounts.get(&account_id).expect("no balance");
        let fees = SPONSOR_FEE + FUNDING_AMOUNT + u128::from(self.storage_minimum_balance());
        assert!(amount > fees, "not enough to upgrade and pay fees");
        self.internal_withdraw(&account_id, fees);
        env::log(format!("Withdraw {} NEAR from {}", amount, account_id).as_bytes());
        // create the guest account
        // transfer FUNDING_AMOUNT in NEAR to the new account
        // remaining tokens belongs to user
        Promise::new(account_id.clone())
            .create_account()
            .add_full_access_key(public_key.into())
            .add_access_key(
                access_key.into(),
                ACCESS_KEY_ALLOWANCE,
                env::current_account_id(),
                method_names.as_bytes().to_vec(),
            )
            .transfer(FUNDING_AMOUNT)
            .then(ext_self::on_account_created(
                account_id,
                pk,
                
                &env::current_account_id(),
                NO_DEPOSIT,
                ON_CREATE_ACCOUNT_CALLBACK_GAS,
            ))
    }

    /// after the account is created we'll delete all the guests activity
    pub fn on_account_created(&mut self, account_id: AccountId, public_key: PublicKey) -> bool {
        let creation_succeeded = is_promise_success();
        if creation_succeeded {
            self.guests.remove(&public_key);
        }
        creation_succeeded
    }

    /// view methods
    pub fn get_guest(&self, public_key: Base58PublicKey) -> AccountId {
        self.guests.get(&public_key.into()).expect("no guest")
    }

}

/// Callback for after upgrade_guest
#[ext_contract(ext_self)]
pub trait ExtContract {
    fn on_account_created(&mut self, account_id: AccountId, public_key: PublicKey) -> bool;
}

fn is_promise_success() -> bool {
    assert_eq!(
        env::promise_results_count(),
        1,
        "Contract expected a result on the callback"
    );
    match env::promise_result(0) {
        PromiseResult::Successful(_) => true,
        _ => false,
    }
}


#[cfg(not(target_arch = "wasm32"))]
#[cfg(test)]
mod fungible_token_tests {
    use near_sdk::MockedBlockchain;
    use near_sdk::{testing_env, VMContext};

    use super::*;
    use near_sdk::json_types::ValidAccountId;
    use std::convert::TryFrom;

    const ZERO_U128: Balance = 0u128;

    fn alice() -> ValidAccountId {
        ValidAccountId::try_from("alice.near").unwrap()
    }
    fn bob() -> ValidAccountId {
        ValidAccountId::try_from("bob.near").unwrap()
    }
    fn carol() -> ValidAccountId {
        ValidAccountId::try_from("carol.near").unwrap()
    }
    fn dex() -> ValidAccountId {
        ValidAccountId::try_from("dex.near").unwrap()
    }

    fn get_context(predecessor_account_id: AccountId) -> VMContext {
        VMContext {
            current_account_id: "mike.near".to_string(),
            signer_account_id: "bob.near".to_string(),
            signer_account_pk: vec![0, 1, 2],
            predecessor_account_id,
            input: vec![],
            block_index: 0,
            block_timestamp: 0,
            account_balance: 1000 * 10u128.pow(24),
            account_locked_balance: 0,
            storage_usage: 10u64.pow(6),
            attached_deposit: 0,
            prepaid_gas: 10u64.pow(18),
            random_seed: vec![0, 1, 2],
            is_view: false,
            output_data_receivers: vec![],
            epoch_height: 0,
        }
    }

    #[test]
    fn contract_creation_with_new() {
        testing_env!(get_context(dex().as_ref().to_string()));

        let contract = Contract::new(
            dex(),
            U128::from(1_000_000_000_000_000),
            String::from("0.1.0"),
            String::from("NEAR Test Token"),
            String::from("TEST"),
            String::from(
                "https://github.com/near/core-contracts/tree/master/w-near-141",
            ),
            "7c879fa7b49901d0ecc6ff5d64d7f673da5e4a5eb52a8d50a214175760d8919a".to_string(),
            24
        );
        assert_eq!(contract.ft_total_supply().0, 1_000_000_000_000_000);
        assert_eq!(contract.ft_balance_of(alice()).0, ZERO_U128);
        assert_eq!(contract.ft_balance_of(bob().into()).0, ZERO_U128);
        assert_eq!(contract.ft_balance_of(carol().into()).0, ZERO_U128);
    }

    #[test]
    #[should_panic(expected = "Contract is not initialized")]
    fn default_fails() {
        testing_env!(get_context(carol().into()));
        let _contract = Contract::default();
    }
}
