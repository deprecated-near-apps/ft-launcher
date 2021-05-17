const CONTRACT_NAME = "dev-1617294637248-3968382";

module.exports = function getConfig(isServer = false) {
  let config = {
    networkId: "testnet",
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
    CONTRACT_NAME,
  };

  if (process.env.REACT_APP_ENV !== undefined) {
    config = {
      ...config,
      GAS: "200000000000000",
      MIN_ATTACHED_BALANCE: "5000000000000000000000000",
      DEFAULT_NEW_ACCOUNT_AMOUNT: "5",
      GUESTS_ACCOUNT_SECRET:
        "7UVfzoKZL4WZGF98C3Ue7tmmA6QamHCiB1Wd5pkxVPAc7j6jf3HXz5Y9cR93Y68BfGDtMLQ9Q29Njw5ZtzGhPxv",
      contractMethods: {
        changeMethods: [
          "new",
          "create_token",
          "add_guest",
          "claim_drop",
          "upgrade_guest",
          "get_predecessor",
          "ft_transfer",
          "ft_transfer_guest",
          "storage_deposit",
        ],
        viewMethods: ["ft_balance_of", "storage_minimum_balance", "get_guest"],
      },
    };
  }

  if (process.env.REACT_APP_ENV === "prod") {
    config = {
      ...config,
      networkId: "mainnet",
      nodeUrl: "https://rpc.mainnet.near.org",
      walletUrl: "https://wallet.near.org",
      helperUrl: "https://helper.mainnet.near.org",
      CONTRACT_NAME: "near",
    };
  }

  return config;
};
