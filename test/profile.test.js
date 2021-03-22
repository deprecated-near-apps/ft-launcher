const nearAPI = require('near-api-js');
const testUtils = require('./test-utils');
const getConfig = require('../src/config');
const BN = require('bn.js')

const { Contract, KeyPair, Account, utils: { format: { parseNearAmount, formatNearAmount }} } = nearAPI;
const { 
	connection, initContract, getAccount, getContract, getAccountBalance,
	contract, contractAccount, contractName, contractMethods, createAccessKeyAccount,
	createOrInitAccount,
} = testUtils;
const { 
	networkId, GAS, MIN_ATTACHED_BALANCE,
	DEFAULT_NEW_ACCOUNT_AMOUNT, GUESTS_ACCOUNT_SECRET
} = getConfig();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 50000;

/// token stuff
const guestId = 'guests.' + contractAccount.accountId;
const total_supply = parseNearAmount('1000000000');

const getTokenContract = (account, token_account_id) => {
	return new Contract(account, token_account_id, contractMethods);
};

const getStorageDiff = (a, b) => new BN(a).sub(new BN(b)).toString()


describe('deploy contract ' + contractName, () => {

	let alice, contractAlice, 
		bobId, contractBob,
		contract,
		storageMinimum;

	const costs = []

	beforeAll(async () => {
	    const { contract } = await initContract();

        const tokenId = contractAccount.accountId

		/// create guest account for bob
		bobId = 'g' + Date.now() + '.' + tokenId;
		console.log('\n\n', bobId, '\n\n');
		const keyPair = KeyPair.fromRandom('ed25519');
		const public_key = keyPair.publicKey.toString();
		const guestAccount = await createOrInitAccount(guestId, GUESTS_ACCOUNT_SECRET);

		const gb1 = (await getAccountBalance(guestId)).total
		await guestAccount.addKey(public_key, tokenId, contractMethods.changeMethods, parseNearAmount('0.1'));
		const gb2 = (await getAccountBalance(guestId)).total

		costs.push(getStorageDiff(gb1, gb2))
		console.log('\n\nguestAccount.addKey:', getStorageDiff(gb1, gb2), '\n\n');

		try {
			const cb1 = (await getAccountBalance(contractName)).available
			await contract.add_guest({ account_id: bobId, public_key }, GAS);
			const cb2 = (await getAccountBalance(contractName)).available
			costs.push(getStorageDiff(cb1, cb2))
			console.log('\n\contract.add_guest:', getStorageDiff(cb1, cb2), '\n\n');
		} catch(e) {
			console.warn(e);
		}

		connection.signer.keyStore.setKey(networkId, guestId, keyPair);
		contractBob = getTokenContract(guestAccount, tokenId);
		const guest = await contract.get_guest({ public_key });
		console.log(guest);
	});

	test('claim drop', async () => {
		const gb1 = (await getAccountBalance(guestId)).total
		await contractBob.claim_drop({});
		const gb2 = (await getAccountBalance(guestId)).total
		costs.push(getStorageDiff(gb1, gb2))
		console.log('\n\ncontractBob.claim_drop:', getStorageDiff(gb1, gb2), '\n\n');

		const total = costs.reduce((acc, b) => new BN(acc).add(new BN(b)).toString())
		console.log('\n\ntotal cost of guest claiming drop:', formatNearAmount(total, 12), '\n\n');
	});

	test('bob upgrades self', async () => {
		const keyPair = KeyPair.fromRandom('ed25519');
		const keyPair2 = KeyPair.fromRandom('ed25519');
		const public_key = keyPair.publicKey.toString();
		const public_key2 = keyPair2.publicKey.toString();
		const gb1 = (await getAccountBalance(guestId)).total
		const result = await contractBob.upgrade_guest({
			public_key,
			access_key: public_key2,
			method_names: '',
		}, GAS);
		console.log('RESULT', result);
		const gb2 = (await getAccountBalance(guestId)).total
		costs.push(getStorageDiff(gb1, gb2))
		console.log('\n\ncontractBob.upgrade_guest:', getStorageDiff(gb1, gb2), '\n\n');
		/// update account and contract for bob (bob now pays gas)
		connection.signer.keyStore.setKey(networkId, bobId, keyPair);
		const balance = await testUtils.getAccountBalance(bobId);
		/// creating account only moves 0.5 NEAR and the rest is still wNEAR
		expect(balance.total).toEqual(parseNearAmount('0.5'));
		
		const total = costs.reduce((acc, b) => new BN(acc).add(new BN(b)).toString())
		console.log('\n\ntotal cost of guest claiming drop and then upgrading:', formatNearAmount(total, 12), '\n\n');
	});
});