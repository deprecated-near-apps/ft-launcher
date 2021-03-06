const nearAPI = require('near-api-js');
const testUtils = require('./test-utils');
const getConfig = require('../src/config');

const { Contract, KeyPair, Account, utils: { format: { parseNearAmount }} } = nearAPI;
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
const guestId = 'guests.' + contractName;
const tokenId = 'token.' + contractAccount.accountId;
const total_supply = parseNearAmount('1000000000');

const tokenMethods = {
	changeMethods: ['add_guest', 'upgrade_guest', 'get_predecessor', 'ft_transfer', 'ft_transfer_guest', 'storage_deposit'],
	viewMethods: ['ft_balance_of', 'storage_minimum_balance', 'get_guest'],
};
const getTokenContract = (account, token_account_id) => {
	return new Contract(account, token_account_id, tokenMethods);
};


describe('deploy contract ' + contractName, () => {
	let alice, contractAlice, 
		bobId, contractBob,
		contract,
		storageMinimum;

	beforeAll(async () => {
	    const { contract: launchContract } = await initContract();

		try {
			await launchContract.create_token({
				token_account_id: tokenId,
				owner_id: contractAccount.accountId,
				total_supply,
				version: '1',
				name: 'dope-token-launcher',
				symbol: 'DTL',
				reference: 'https://github.com/near/core-contracts/tree/master/w-near-141',
				reference_hash: '7c879fa7b49901d0ecc6ff5d64d7f673da5e4a5eb52a8d50a214175760d8919a',
				decimals: 24
			}, GAS, MIN_ATTACHED_BALANCE);
		} catch (e) {
			if (!/because it already exists/.test(e.toString())) {
				throw e;
			}
		}

		/// contract is the token contract now and contractAccount is the owner
		contract = await getTokenContract(contractAccount, tokenId);
		storageMinimum = await contract.storage_minimum_balance();
		/// normal user alice
		alice = await getAccount();
		contractAlice = await getTokenContract(alice, tokenId);
		console.log('\n\n', alice.accountId, '\n\n');
		/// create guest account for bob
		bobId = 'g' + Date.now() + '.' + tokenId;
		console.log('\n\n', bobId, '\n\n');
		const keyPair = KeyPair.fromRandom('ed25519');
		const public_key = keyPair.publicKey.toString();
		const guestAccount = await createOrInitAccount(guestId, GUESTS_ACCOUNT_SECRET);
		await guestAccount.addKey(public_key, tokenId, tokenMethods.changeMethods, parseNearAmount('0.1'));
		try {
			await contract.add_guest({ account_id: bobId, public_key }, GAS);
		} catch(e) {
			console.warn(e);
		}
		connection.signer.keyStore.setKey(networkId, guestId, keyPair);
		contractBob = getTokenContract(guestAccount, tokenId);

		const guest = await contract.get_guest({ public_key });

		console.log(guest);
	});

	test('owner balance', async () => {
		const balance = await contract.ft_balance_of({ account_id: contractName });
		console.log('\n\n', balance, '\n\n');
	});

	test('bob is a guest', async () => {
		const predecessor = await contractBob.get_predecessor({}, GAS);
		console.log('\n\n', bobId, '\n\n');
		expect(predecessor).toEqual(bobId);
	});

	test('ft_transfer', async () => {
		/// send tokens to bob, who is a guest and already registered for storage
		let amount = parseNearAmount('100');

		await contract.ft_transfer({
			receiver_id: bobId,
			amount
		}, GAS, 1);

		/// check balance
		const balance = await contract.ft_balance_of({ account_id: bobId });

		expect(balance).toEqual(amount);
	});

	test('ft_transfer_guest', async () => {
		/// send tokens to alice who needs to register her storage
		await contractAlice.storage_deposit({}, GAS, storageMinimum);
		let amount = parseNearAmount('50');
		await contractBob.ft_transfer_guest({
			receiver_id: alice.accountId,
			amount
		}, GAS);

		/// check balance
		const balance = await contract.ft_balance_of({ account_id: alice.accountId });
		expect(balance).toEqual(amount);
		/// check balance
		const balance2 = await contract.ft_balance_of({ account_id: bobId });
		expect(balance2).toEqual(amount);
	});

	test('bob upgrades self with wNEAR', async () => {
		const keyPair = KeyPair.fromRandom('ed25519');
		const keyPair2 = KeyPair.fromRandom('ed25519');
		const public_key = keyPair.publicKey.toString();
		const public_key2 = keyPair2.publicKey.toString();
		connection.signer.keyStore.setKey(networkId, bobId, keyPair);
		const result = await contractBob.upgrade_guest({
			public_key,
			access_key: public_key2,
			method_names: '',
		}, GAS);
		console.log('RESULT', result);
		/// update account and contract for bob (bob now pays gas)
		const balance = await testUtils.getAccountBalance(bobId);
		/// creating account only moves 0.5 NEAR and the rest is still wNEAR
		expect(balance.total).toEqual(parseNearAmount('0.5'));
		
	});

});