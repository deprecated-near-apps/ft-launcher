const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const cors = require('cors');
const nearAPI = require('near-api-js');
const getConfig = require('../src/config');
const { withNear, hasAccessKey } = require('./middleware/near');
const { near, ownerId, ownerAccount, ownerSecret } = require('./utils/near-utils');
const { networkId, GAS, MIN_ATTACHED_BALANCE, contractMethods, GUESTS_ACCOUNT_SECRET } = getConfig();
const {
	KeyPair, Account,
	transactions: { deployContract, functionCall },
	utils: { PublicKey, serialize: { base_encode }, format: { parseNearAmount } }
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
	return { keyPair, implicitAccountId };
};

/// WARNING NO RESTRICTION ON THIS ENDPOINT
app.post('/launch-token', async (req, res) => {
	const {
		totalSupply,
		name,
		symbol,
		continuous = false,
	} = req.body; 
    
	/// TODO validate symbol and totalSupply

	if (name.indexOf(ownerId) !== -1) {
		return res.status(403).send({ error: `tokens are by default subaccount of ${ownerId} you don't need to include this`});
	}

	const tokenId = name + '.' + ownerId;
	console.log('\nCreating Account:', tokenId);
	/// get keyPair for token sub account with deterministic key from ownerSecret
	const { keyPair } = getDeterministic(tokenId);
	try {
		await ownerAccount.createAccount(tokenId, keyPair.publicKey, MIN_ATTACHED_BALANCE);
	} catch(e) {
		console.warn(e);
		return res.status(403).send({ error: `error creating token account`, e});
	}

	console.log('\nCreating Account:', 'guests.' + ownerId);
	const guestKeyPair = KeyPair.fromString(GUESTS_ACCOUNT_SECRET);
	/// create guests.TOKEN_NAME account with 1 N storage for managing guest users
	try {
		await ownerAccount.createAccount('guests.' + ownerId, guestKeyPair.publicKey, parseNearAmount('1'));
	} catch(e) {
		console.warn(e);
		// return res.status(403).send({ error: `error creating guests account`, e});
	}

	/// deploy token contract
	const contractBytes = fs.readFileSync('../out/main.wasm');
	const newArgs = {
		/// will have totalSupply minted to them
		owner_id: ownerId,
		total_supply: totalSupply,
		name,
		symbol,
		// not set by user request
		version: '1',
		reference: 'https://github.com/near/core-contracts/tree/master/w-near-141',
		reference_hash: '7c879fa7b49901d0ecc6ff5d64d7f673da5e4a5eb52a8d50a214175760d8919a',
		decimals: 24,
		continuous,
	};
	console.log(newArgs);
	const actions = [
		deployContract(contractBytes),
		functionCall('new', newArgs, GAS)
	];
	/// setup signer for tokenAccount txs and sign tx
	near.connection.signer.keyStore.setKey(networkId, tokenId, keyPair);
	const tokenAccount = new Account(near.connection, tokenId);
	console.log('\nDeploying Contract for:', tokenId);
	try {
		const result = await tokenAccount.signAndSendTransaction(tokenAccount.accountId, actions);
		res.json({ success: true, result });
	} catch(e) {
		console.warn(e);
		return res.status(403).send({ error: `error deploying token contract`, e});
	}
});

/// WARNING NO RESTRICTION ON THIS ENDPOINT
app.post('/add-guest', async (req, res) => {
	const { tokenId, account_id, public_key } = req.body;
	/// setup signer for guestAccount txs
	const guestId = 'guests.' + ownerId;
	const guestKeyPair = KeyPair.fromString(GUESTS_ACCOUNT_SECRET);
	near.connection.signer.keyStore.setKey(networkId, guestId, guestKeyPair);
	const guestsAccount = new Account(near.connection, guestId);
	/// try adding key to guestAccount and guest record to contract
	console.log('\nAdding guest account:', account_id);
	try {
		const addKey = await guestsAccount.addKey(public_key, tokenId, contractMethods.changeMethods, parseNearAmount('0.1'));
		const add_guest = await ownerAccount.functionCall(tokenId, 'add_guest', { account_id, public_key }, GAS);
		res.json({ success: true, result: { addKey, add_guest } });
	} catch(e) {
		console.warn(e);
		return res.status(403).send({ error: `error adding guest`, e});
	}
});

/// WARNING NO RESTRICTION ON THIS ENDPOINT
app.post('/transfer-tokens', async (req, res) => {
	const { tokenId, receiver_id, amount } = req.body;
	console.log('\nTransfering tokens to:', receiver_id, amount);
	try {
		const result = await ownerAccount.functionCall(tokenId, 'ft_transfer', { receiver_id, amount }, GAS, 1);
		res.json({ success: true, result });
	} catch(e) {
		console.warn(e);
		return res.status(403).send({ error: `error with transfer`, e});
	}
});

/// WARNING NO RESTRICTION ON THIS ENDPOINT
app.post('/mint', async (req, res) => {
	const { tokenId, amount } = req.body;
	console.log('\nMinting new tokens to:', ownerId, amount);
	try {
		const result = await ownerAccount.functionCall(tokenId, 'mint', { amount }, GAS);
		res.json({ success: true, result });
	} catch(e) {
		console.warn(e);
		return res.status(403).send({ error: `error with transfer`, e});
	}
});

/// View only methods

app.post('/balance-of', async (req, res) => {
	const { tokenId, accountId } = req.body;
	try {
		const balance = await ownerAccount.viewFunction(tokenId, 'ft_balance_of', { account_id: accountId }, GAS);
		console.log('\nBalance of:', accountId, balance);
		res.json({ success: true, balance });
	} catch(e) {
		console.warn(e);
		return res.status(403).send({ error: `error with transfer`, e});
	}
});

app.post('/total-supply', async (req, res) => {
	const { tokenId } = req.body;
	try {
		const supply = await ownerAccount.viewFunction(tokenId, 'ft_total_supply', {}, GAS);
		console.log('\nTotal supply of:', tokenId, supply);
		res.json({ success: true, supply });
	} catch(e) {
		console.warn(e);
		return res.status(403).send({ error: `error with transfer`, e});
	}
});

app.listen(port, () => {
	console.log(`\nContract Account ID:\n${ownerId}\nListening at http://localhost:${port}`);
});
