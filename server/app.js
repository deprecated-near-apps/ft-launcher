const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const cors = require('cors');
const nearAPI = require('near-api-js');
const getConfig = require('../src/config');
const { withNear, hasAccessKey } = require('./middleware/near');
const { near, ownerId, ownerAccount, ownerSecret } = require('./utils/near-utils');
const { networkId, GAS, MIN_ATTACHED_BALANCE } = getConfig();
const {
    KeyPair, Account,
    transactions: { deployContract, functionCall },
	utils: { PublicKey, serialize: { base_encode } }
} = nearAPI;

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(withNear());

const getDeterministic = (tokenName) => {
    const hash = crypto.createHash('sha256').update(ownerSecret + tokenName).digest();
    const keyPair = KeyPair.fromString(base_encode(nacl.sign.keyPair.fromSeed(hash).secretKey));
    const implicitAccountId = Buffer.from(PublicKey.from(keyPair.publicKey).data).toString('hex');
    return { keyPair, implicitAccountId }
}

// WARNING NO RESTRICTION ON THIS ENDPOINT
app.post('/launch-token', async (req, res) => {
    const {
        total_supply,
        name,
        symbol,
    } = req.body 
    
    /// TODO validate symbol and totalSupply

    if (!name.indexOf(ownerId) === -1) {
        return res.status(403).send({ error: `tokens must be subaccount e.g. "TOKEN_ID.${ownerId}"`, e});
    }

    /// create token sub account with deterministic key from ownerSecret
    const { keyPair } = getDeterministic(name)
    try {
        await ownerAccount.createAccount(name, keyPair.publicKey, MIN_ATTACHED_BALANCE);
    } catch(e) {
        console.log(e);
    }

    /// setup signer for tokenAccount txs
    near.connection.signer.keyStore.setKey(networkId, name, keyPair);
    const tokenAccount = new Account(near.connection, name)

    const contractBytes = fs.readFileSync('../out/main.wasm');
    const newArgs = {
        owner_id: ownerId,
        total_supply,
        name,
        symbol,
        // not set by request
        version: '1',
        reference: 'https://github.com/near/core-contracts/tree/master/w-near-141',
        reference_hash: '7c879fa7b49901d0ecc6ff5d64d7f673da5e4a5eb52a8d50a214175760d8919a',
        decimals: 24
    };
    const actions = [
        deployContract(contractBytes),
        functionCall('new', newArgs, GAS)
    ];
    try {
        const result = await tokenAccount.signAndSendTransaction(accountId, actions);
        res.json({ success: true, result });
    } catch(e) {
        return res.status(403).send({ error: `something happened when deploying your token contract`, e});
    }
});


// // WARNING NO RESTRICTION ON THIS ENDPOINT
// app.post('/add-guest', async (req, res) => {
// 	const { account_id, public_key } = req.body;
// 	try {
// 		const addKey = await guestAccount.addKey(public_key, ownerId, contractMethods.changeMethods, parseNearAmount('0.1'));
// 		const add_guest = await contract.add_guest({ account_id, public_key }, GAS);
// 		res.json({ addKey, add_guest });
// 	} catch(e) {
// 		console.log(e);
// 		return res.status(403).send({ error: `key is already added`, e});
// 	}
// });

app.post('/has-access-key', hasAccessKey, (req, res) => {
	res.json({ success: true });
});

app.listen(port, () => {
	console.log(`\nContract Account ID:\n${ownerId}\nListening at http://localhost:${port}`);
});
