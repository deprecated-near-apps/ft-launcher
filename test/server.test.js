const nearAPI = require('near-api-js');
const testUtils = require('./test-utils');
const getConfig = require('../src/config');

const { KeyPair, utils: { format: { parseNearAmount }} } = nearAPI;
const { TEST_HOST, keyStore, initContract, getAccount, contractAccount, postSignedJson, postJson } = testUtils;
const { contractName: ownerId, networkId } = getConfig();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 50000;


describe('deploy API owned by: ' + ownerId, () => {
	let alice;

	beforeAll(async () => {
		alice = await getAccount();
		await initContract();
	});

	test('launch token', async () => {
		const { success, result } = await postJson({
            url: TEST_HOST + '/launch-token',
            data: {
                name: 'token-' + Date.now(),
                symbol: 'TEST',
                totalSupply: parseNearAmount('1000000'),
            }
        })

        console.log(success, result)
	});
});