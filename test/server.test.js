const nearAPI = require('near-api-js');
const testUtils = require('./test-utils');
const getConfig = require('../src/config');

const { Account, KeyPair, utils: { format: { parseNearAmount }} } = nearAPI;
const { near, TEST_HOST, initContract, getAccount, contractAccount: ownerAccount, postJson } = testUtils;
const { GAS, contractName: ownerId, networkId } = getConfig();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 50000;

describe('deploy API owned by: ' + ownerId, () => {
	let alice, bobId, bobAccount, storage_minimum_balance;
	const tokenAccountName = `token-${Date.now()}`;
	const tokenAccountName2 = `token2-${Date.now()}`;
	const tokenId = `${tokenAccountName}.${ownerId}`;
	const tokenId2 = `${tokenAccountName2}.${ownerId}`;
	const guestId = 'guests.' + ownerId;

	beforeAll(async () => {
		alice = await getAccount();
		await initContract();
	});

	/// API
	test('API - deploy token', async () => {
		const { success, result } = await postJson({
			url: TEST_HOST + '/launch-token',
			data: {
				name: tokenAccountName,
				symbol: 'TEST',
				totalSupply: parseNearAmount('1000000'),
			}
		});
		expect(success).toEqual(true);
	});

	/// CLIENT / API
	test('CLIENT / API - owner transfer tokens to alice', async () => {
		/// alice must register to receive tokens
		storage_minimum_balance = await alice.viewFunction(tokenId, 'storage_minimum_balance');
		await alice.functionCall(tokenId, 'storage_deposit', {}, GAS, storage_minimum_balance);
		/// now make api call to transfer Alice tokens
		const { success, result } = await postJson({
			url: TEST_HOST + '/transfer-tokens',
			data: {
				tokenId,
				receiver_id: alice.accountId,
				amount: parseNearAmount('100'),
				continuous: false,
			}
		});
		expect(success).toEqual(true);
		const balance = await alice.viewFunction(tokenId, 'ft_balance_of', { account_id: alice.accountId }, GAS);
		expect(balance).toEqual(parseNearAmount('100'));
	});

	/// API
	test('API - check balance of tokens', async () => {
		const { success, balance } = await postJson({
			url: TEST_HOST + '/balance-of',
			data: {
				tokenId,
				accountId: alice.accountId,
			}
		});
		expect(success).toEqual(true);
		expect(balance).toEqual(parseNearAmount('100'));
	});

	/// API
	test('API - add guest user', async () => {
		bobId = 'bob.' + tokenId;
		const keyPair = KeyPair.fromRandom('ed25519');
		/// bob's key signs tx from guest account (sponsored)
		near.connection.signer.keyStore.setKey(networkId, guestId, keyPair);
		bobAccount = new Account(near.connection, guestId);

		const { success, result } = await postJson({
			url: TEST_HOST + '/add-guest',
			data: {
				tokenId,
				account_id: bobId,
				public_key: keyPair.publicKey.toString(),
			}
		});
		expect(success).toEqual(true);
	});


	/// CLIENT
	test('CLIENT - bob guest claim drop self', async () => {
		await bobAccount.functionCall(tokenId, 'claim_drop', {}, GAS);
		const balance = await bobAccount.viewFunction(tokenId, 'ft_balance_of', { account_id: bobId }, GAS);
		expect(balance).toEqual(parseNearAmount('100'));
	});

	/// CLIENT
	test('CLIENT - owner transfer tokens to guest (client)', async () => {
		await ownerAccount.functionCall(tokenId, 'ft_transfer', {
			receiver_id: bobId,
			amount: parseNearAmount('50'),
		}, GAS, 1);
		const balance = await bobAccount.viewFunction(tokenId, 'ft_balance_of', { account_id: bobId }, GAS);
		expect(balance).toEqual(parseNearAmount('150'));
	});

	/// API
	test('API - owner transfer tokens to guest', async () => {
		const { success, result } = await postJson({
			url: TEST_HOST + '/transfer-tokens',
			data: {
				tokenId,
				receiver_id: bobId,
				amount: parseNearAmount('50'),
			}
		});
		expect(success).toEqual(true);
		const balance = await bobAccount.viewFunction(tokenId, 'ft_balance_of', { account_id: bobId }, GAS);
		expect(balance).toEqual(parseNearAmount('200'));
	});

	/// CLIENT
	test('CLIENT - bob guest transfer to alice', async () => {
		/// send tokens to alice who needs to register her storage
		const amount = parseNearAmount('100');
		await bobAccount.functionCall(tokenId, 'ft_transfer_guest', { receiver_id: alice.accountId, amount }, GAS);
		const balance = await bobAccount.viewFunction(tokenId, 'ft_balance_of', { account_id: bobId }, GAS);
		expect(balance).toEqual(amount);
		const balance2 = await bobAccount.viewFunction(tokenId, 'ft_balance_of', { account_id: alice.accountId }, GAS);
		expect(balance2).toEqual(parseNearAmount('200'));
	});

	/// CLIENT
	test('CLIENT - bob upgrades to full account', async () => {
		const keyPair = KeyPair.fromRandom('ed25519');
		const keyPair2 = KeyPair.fromRandom('ed25519');
		const public_key = keyPair.publicKey.toString();
		const public_key2 = keyPair2.publicKey.toString();
		near.connection.signer.keyStore.setKey(networkId, bobId, keyPair);
		await bobAccount.functionCall(tokenId, 'upgrade_guest', {
			public_key,
			access_key: public_key2,
			method_names: '',
		}, GAS);
		/// update account and contract for bob (bob now pays gas)
		const balance = await testUtils.getAccountBalance(bobId);
		/// creating account only moves 0.5 NEAR and the rest is still wNEAR
		expect(balance.total).toEqual(parseNearAmount('0.5'));
	});

	/// API
	test('API - deploy another token', async () => {
		const { success, result } = await postJson({
			url: TEST_HOST + '/launch-token',
			data: {
				name: tokenAccountName2,
				symbol: 'TEST',
				totalSupply: parseNearAmount('1000000'),
				continuous: true,
			}
		});
		expect(success).toEqual(true);
	});

	/// API
	test('API - mint more tokens to owner', async () => {
		const { success, result } = await postJson({
			url: TEST_HOST + '/mint',
			data: {
				tokenId: tokenId2,
				amount: parseNearAmount('1000000')
			}
		});
		expect(success).toEqual(true);
	});

	/// API
	test('API - check balance of owner tokens', async () => {
		const { success, balance } = await postJson({
			url: TEST_HOST + '/balance-of',
			data: {
				tokenId: tokenId2,
				accountId: ownerId,
			}
		});
		expect(success).toEqual(true);
		expect(balance).toEqual(parseNearAmount('2000000'));
	});

	/// API
	test('API - check total supply', async () => {
		const { success, supply } = await postJson({
			url: TEST_HOST + '/total-supply',
			data: {
				tokenId: tokenId2,
			}
		});
		expect(success).toEqual(true);
		expect(supply).toEqual(parseNearAmount('2000000'));
	});

});