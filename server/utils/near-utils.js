const fs = require("fs");
const nearAPI = require("near-api-js");
const getConfig = require("../../src/config");
const {
  nodeUrl,
  networkId,
  contractName: ownerId,
  contractMethods,
} = getConfig(true);
const {
  keyStores: { InMemoryKeyStore },
  Near,
  Account,
  KeyPair,
  utils: {
    format: { parseNearAmount },
  },
} = nearAPI;

console.log(
  "Loading Credentials:\n",
  `${process.env.HOME}/.near-credentials/${networkId}/${contractName}.json`
);
const credentials = JSON.parse(
  fs.readFileSync(
    `${process.env.HOME}/.near-credentials/${networkId}/${contractName}.json`
  )
);
const keyStore = new InMemoryKeyStore();
keyStore.setKey(
  networkId,
  ownerId,
  KeyPair.fromString(credentials.private_key)
);
const near = new Near({
  networkId,
  nodeUrl,
  deps: { keyStore },
});
const { connection } = near;
const ownerAccount = new Account(connection, ownerId);
ownerAccount.addAccessKey = (publicKey) =>
  ownerAccount.addKey(
    publicKey,
    ownerId,
    contractMethods.changeMethods,
    parseNearAmount("0.1")
  );

module.exports = {
  near,
  keyStore,
  connection,
  ownerId,
  ownerAccount,
  ownerSecret: credentials.private_key,
};
