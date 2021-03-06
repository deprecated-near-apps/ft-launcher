import React, { useEffect, useState } from 'react';
import * as nearAPI from 'near-api-js';
import { GAS, formatNearAmount, parseNearAmount } from '../state/near';
import { generateSeedPhrase, parseSeedPhrase } from 'near-seed-phrase';
import { get, set, del } from '../utils/storage';
import {
	networkId,
	postJson,
	contractName,
	getContract,
	isAccountTaken,
    setSignerFromSeed,
	MIN_ATTACHED_BALANCE,
} from '../utils/near-utils';
import BN from 'bn.js';

import {GUEST_ACCOUNTS} from './Guest'
const TEMP_OWNER = '__TEMP_OWNER';
const TEMP_GUEST = '__TEMP_GUEST';

const {
	KeyPair,
	Account,
	transactions: {
		deployContract, functionCall
	}
} = nearAPI;

const nameSuffix = '.testnet';
const namingContractName = 'testnet';


export const Launcher = ({ near, update, account, deployedToken, guestsAccount }) => {

	if (!account) return null;

	const [totalSupply, setTotalSupply] = useState('');
	const [symbol, setSymbol] = useState('');
	const [name, setName] = useState('');
	const [accountId, setAccountId] = useState('');

	useEffect(() => {
		const data = get(TEMP_OWNER);
		if (!data.seedPhrase) return;
		checkTempData(data);
	}, []);

	const checkTempData = async ({
		seedPhrase,
		accountId,
		totalSupply,
		symbol,
		name
	}) => {
		if (!(await isAccountTaken(near, accountId))) {
			del(TEMP_OWNER);
			return alert('funding account failed');
		}
		const account = new Account(near.connection, accountId);

        setSignerFromSeed(accountId, seedPhrase)

		const state = await account.state();
		if (state.code_hash !== '11111111111111111111111111111111') {
			let guestsAccount = get(TEMP_GUEST);
			if (guestsAccount.seedPhrase) {
                setSignerFromSeed(guestsAccount.accountId, guestsAccount.seedPhrase)
			} else {
				guestsAccount = null;
			}
            
			return update('', {
				deployedToken: {
					seedPhrase,
					accountId,
					totalSupply,
					symbol,
					name
				},
				guestsAccount
			});
		}

		update('loading', true);
		const contractBytes = new Uint8Array(await fetch('main.wasm').then((res) => res.arrayBuffer()));
		const newArgs = {
			owner_id: account.accountId,
			total_supply: parseNearAmount(totalSupply),
			name,
			symbol,
			// not set
			version: '1',
			reference: 'https://github.com/near/core-contracts/tree/master/w-near-141',
			reference_hash: '7c879fa7b49901d0ecc6ff5d64d7f673da5e4a5eb52a8d50a214175760d8919a',
			decimals: 24
		};
		const actions = [
			deployContract(contractBytes),
			functionCall('new', newArgs, GAS)
		];
		account.signAndSendTransaction(accountId, actions);
		update('loading', false);
	};

	const handleLaunch = async () => {
		if (!name.length || !accountId.length || !symbol.length || !totalSupply.length) {
			return alert('please fill in all fields');
		}
		if (accountId.indexOf(nameSuffix) > -1 || accountId.indexOf('.') > -1) {
			return alert(nameSuffix + ' is added automatically and no "." is allowed. Please remove and try again.');
		}
		const new_account_id = accountId + nameSuffix;
		if (await isAccountTaken(near, new_account_id)) {
			return alert('accountId is taken');
		}

		const { seedPhrase, secretKey } = generateSeedPhrase();
		const keyPair = KeyPair.fromString(secretKey);

		set(TEMP_OWNER, {
			seedPhrase,
			accountId: new_account_id,
			totalSupply,
			symbol,
			name
		});

		account.functionCall(namingContractName, 'create_account', {
			new_account_id,
			new_public_key: keyPair.publicKey.toString()
		}, GAS, MIN_ATTACHED_BALANCE);
	};

	const handleGuestsAccount = async () => {
		const { accountId } = deployedToken;
		const guestsAccountId = 'guests.' + accountId;
		if (await isAccountTaken(near, guestsAccountId)) {
			return alert('guests account exists');
		}
		update('loading', true);
		const account = new Account(near.connection, accountId);
		const { seedPhrase, secretKey } = generateSeedPhrase();
		const keyPair = KeyPair.fromString(secretKey);
		try {
			await account.createAccount(guestsAccountId, keyPair.publicKey, parseNearAmount('1'));
		} catch(e) {
			console.log(e);
		}
		set(TEMP_GUEST, {
			seedPhrase,
			accountId: guestsAccountId,
		});
		update('loading', false);
	};

	return <>
		{
			!deployedToken ? <>
				<input placeholder="Total Supply" value={totalSupply} onChange={(e) => setTotalSupply(e.target.value)} />
				<input placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
				<input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
				<input placeholder="Token Account" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
				<button onClick={() => handleLaunch()}>Launch</button>
			</>
				:
				<>
					<p>Token Account: { deployedToken.accountId }</p>
					<p>Token Seed:<br/>{ deployedToken.seedPhrase }</p>
					<p>Total Supply: { deployedToken.totalSupply }</p>
					<p>Symbol: { deployedToken.symbol }</p>
					<p>Name: { deployedToken.name }</p>
					{
						!guestsAccount &&
                    <button onClick={() => handleGuestsAccount()}>Create Guests Account</button>
					}
					<button onClick={() => {
						del(TEMP_OWNER);
						del(TEMP_GUEST);
						del(GUEST_ACCOUNTS);
                        window.location.reload()
					}}>Delete Token</button>
				</>
		}
	</>;
};


// /// WARNING THIS ENDPOINT NOT PROTECTED
// let result
// try {
//     result = await postJson({
//         url: 'http://localhost:3000/launch-token',
//     });
// } catch (e) {
//     console.log(e)
// }