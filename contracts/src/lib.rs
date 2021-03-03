use near_sdk::{
    wee_alloc, env, near_bindgen, Balance, Gas, Promise,
    json_types::{ U128, ValidAccountId },
    borsh::{self, BorshDeserialize, BorshSerialize},
    serde::Serialize,
};

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// At least 20 NEAR tokens required for the storage of the FT contract
const MIN_ATTACHED_BALANCE: Balance = 20_000_000_000_000_000_000_000_000;
const NO_DEPOSIT: Balance = 0;
const GAS_TOKEN_NEW: Gas = 25_000_000_000_000;

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct TokenArgs {
    owner_id: ValidAccountId,
    total_supply: U128,
    version: String,
    name: String,
    symbol: String,
    reference: String,
    reference_hash: String,
    decimals: u8
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct Contract {
    pub owner_id: ValidAccountId,
}

impl Default for Contract {
    fn default() -> Self {
        panic!("not initialized")
    }
}

#[near_bindgen]
impl Contract {

    #[init]
    pub fn new(owner_id: ValidAccountId) -> Self {
        assert!(!env::state_exists(), "already initialized");
        Self {
            owner_id,
        }
    }

    pub fn create_token(
        token_account_id: ValidAccountId,
        owner_id: ValidAccountId,
        total_supply: U128,
        version: String,
        name: String,
        symbol: String,
        reference: String,
        reference_hash: String,
        decimals: u8
    ) -> Promise {

        let attached_deposit = env::attached_deposit();
        assert!(attached_deposit >= MIN_ATTACHED_BALANCE);

        Promise::new(token_account_id.clone().into())
            .create_account()
            .transfer(attached_deposit)
            .deploy_contract(include_bytes!("../out/ft.wasm").to_vec())
            .function_call(
                b"new".to_vec(),
                near_sdk::serde_json::to_vec(&TokenArgs {
                    owner_id,
                    total_supply,
                    version,
                    name,
                    symbol,
                    reference,
                    reference_hash,
                    decimals,
                }).unwrap(),
                NO_DEPOSIT,
                GAS_TOKEN_NEW,
            )

    }

}