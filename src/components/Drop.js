import React, { useState, useEffect } from 'react';
import * as nearAPI from 'near-api-js';
import { get, set, del } from '../utils/storage';
import { generateSeedPhrase } from 'near-seed-phrase';
import {
	networkId,
	setSignerFromSeed,
	GAS,
	isAccountTaken,
	contractMethods,
} from '../utils/near-utils';

import Insta from 'url:../img/insta.jpg';

export const GUEST_ACCOUNTS = '__GUEST_ACCOUNTS';

const {
	KeyPair, Account, Contract,
	utils: { PublicKey, format: { formatNearAmount, parseNearAmount } }
} = nearAPI;

export const Drop = ({
	near, update, guests = [],
	deployedToken, guestsAccount,
}) => {
	if (!guestsAccount) return null;

	const [username, setUsername] = useState('');
	const [insta, setInsta] = useState(false);
	const [receiver, setReceiver] = useState('');
	const [amount, setAmount] = useState('');
	const [pop, setPop] = useState(false);

	useEffect(() => {
		loadGuests();
	}, []);

	const loadGuests = async () => {
		/// hydrate guests
		const guests = get(GUEST_ACCOUNTS, []);
		for (let i = 0; i < guests.length; i++) {
			const guestAccount = new Account(near.connection, guestsAccount.accountId);
			setSignerFromSeed(guestsAccount.accountId, guests[i].seedPhrase);
			guests[i].balance = await guestAccount.viewFunction(deployedToken.accountId, 'ft_balance_of', { account_id: guests[i].accountId }) || '0';
		}
		update('guests', guests);
	};

	const handleAddGuest = async () => {
		if (!username.length) {
			alert('please enter a username');
			return;
		}
		update('loading', true);

		const accountId = username + '.' + deployedToken.accountId;
		if (await isAccountTaken(near, accountId)) {
			update('loading', false);
			return alert('guest account already exists');
		}

		/// add key to guests account
		const guestAccount = new Account(near.connection, guestsAccount.accountId);
		const tokenAccount = new Account(near.connection, deployedToken.accountId);

		const { seedPhrase, publicKey } = generateSeedPhrase();

		setSignerFromSeed(guestsAccount.accountId, guestsAccount.seedPhrase);

		try {
			await guestAccount.addKey(publicKey, tokenAccount.accountId, contractMethods.changeMethods, parseNearAmount('0.1'));
			await tokenAccount.functionCall(deployedToken.accountId, 'add_guest', { account_id: accountId, public_key: publicKey }, GAS);
			const guest = { accountId, publicKey, seedPhrase, created: Date.now() };
			guests.push(guest);
			console.log('guests', guests);
			update('guests', guests);
			set(GUEST_ACCOUNTS, guests);
		} catch(e) {
			console.warn(e);
		}

		update('loading', false);
	};

	const handleClaimDrop = async (_accountId) => {
		const i = guests.findIndex(({ accountId }) => accountId === _accountId);
		if (i < 0) return;
		update('loading', true);
		const { seedPhrase, publicKey } = guests[i];
		/// set signer to this guest for guests account
		const guestAccount = new Account(near.connection, guestsAccount.accountId);
		setSignerFromSeed(guestsAccount.accountId, seedPhrase);
		try {
			await guestAccount.functionCall(deployedToken.accountId, 'claim_drop', {}, GAS);
		} catch(e) {
			console.warn(e);
		}
		loadGuests();
		update('loading', false);
	};

	const handleTransfer = async (_accountId) => {
		const i = guests.findIndex(({ accountId }) => accountId === _accountId);
		if (i < 0) return;
		const { seedPhrase, publicKey } = guests[i];
		/// set signer to this guest for guests account
		const guestAccount = new Account(near.connection, guestsAccount.accountId);
		setSignerFromSeed(guestsAccount.accountId, seedPhrase);
		const receiver_id = receiver;
		const transfer_amount = parseNearAmount(amount);
		if (!receiver_id.length || !transfer_amount.length) return;
		update('loading', true);
		try {
			await guestAccount.functionCall(deployedToken.accountId, 'ft_transfer_guest', { receiver_id, amount: transfer_amount }, GAS);
		} catch(e) {
			console.log(e);
		}
		loadGuests();
		update('loading', false);
	};

	const handleUpgrade = async (_accountId) => {
		const i = guests.findIndex(({ accountId }) => accountId === _accountId);
		if (i < 0) return;
		/// the new full access key
		const { seedPhrase, publicKey } = generateSeedPhrase();
		if (!window.prompt('keep this somewhere safe', seedPhrase)) {
			return alert('you have to copy the seed phrase down somewhere');
		}
		console.log('seedPhrase', seedPhrase);
		/// additional access key so upgraded user doens't have to sign in with wallet
		const { seedPhrase: accessSeed, secretKey: accessSecret, publicKey: accessPublic } = generateSeedPhrase();

		/// current guest credentials
		const { accountId, seedPhrase: guestSeed } = guests[i];
		/// prep contract and args
		const guestAccount = new Account(near.connection, guestsAccount.accountId);
		setSignerFromSeed(guestsAccount.accountId, guestSeed);
		update('loading', true);
		const public_key = publicKey.toString();
		try {
			await guestAccount.functionCall(deployedToken.accountId, 'upgrade_guest', {
				public_key,
				access_key: accessPublic,
				method_names: contractMethods.changeMethods.join(',')
			}, GAS);

			/// wallet hijacking
			set(`near-api-js:keystore:${accountId}:default`, accessSecret);

			console.log(`undefined_wallet_auth_key`, `{"accountId":"${accountId}","allKeys":["${accessPublic}"]}`);

			set(`undefined_wallet_auth_key`, `{"accountId":"${accountId}","allKeys":["${accessPublic}"]}`);
			/// set to access key pair, still a guest 
			/// e.g. don't have to get full access key secret from app (can use wallet /extention)
			const accessKeyPair = KeyPair.fromString(accessSecret);
			near.connection.signer.keyStore.setKey(networkId, accountId, accessKeyPair);
			guests[i].upgraded = true;
			guests[i].seedPhrase = accessSeed;
			set(GUEST_ACCOUNTS, guests);
			update('guests', guests);
			update('loading', false);
			/// because we hacked the wallet
			window.location.reload();
		} catch (e) {
			console.warn(e);
			alert('upgrading failed');
		}
	};

	const handleRemoveGuest = async (_accountId) => {
		const i = guests.findIndex(({ accountId }) => accountId === _accountId);
		if (i < 0) return;
		update('loading', true);
		try {
			const tokenAccount = new Account(near.connection, deployedToken.accountId);
			await tokenAccount.functionCall(deployedToken.accountId, 'remove_guest', { public_key: guests[i].publicKey }, GAS);
			guests.splice(i, 1);
			update('guests', guests);
			set(GUEST_ACCOUNTS, guests);
		} catch(e) {
			console.warn(e);
		}
		update('loading', false);
	};

	if (insta) {
		return <div className="insta">
			<img onClick={() => {
				setInsta(false);
				setUsername("wills");
			}} src={Insta} />
		</div>;
	}


	if (pop) {
		return <div className="modal">
			<input placeholder="receiver" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
			<input placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
			<button onClick={() => handleTransfer(guests[1].accountId)}>Transfer</button>
			<button onClick={() => setPop(false)}>Back</button>
		</div>;
	}

	const filteredGuests = guests.filter((g) => !g.upgraded);

	return <>
		<>
			{
				filteredGuests.map(({ accountId, balance = '0' }, i) => <div key={accountId}>
					<h3>Guest Account</h3>
					<p>{accountId} - {formatNearAmount(balance, 2)} tokens</p>
					<button onClick={() => handleClaimDrop(accountId)}>Claim Drop</button>
					<button onClick={() => setPop(true)}>Transfer</button>
					<button onClick={() => handleUpgrade(accountId)}>Upgrade</button>
					<button onClick={() => handleRemoveGuest(accountId)}>Remove</button>
				</div>)
			}
		</>

		{ !filteredGuests.length && 
            
            <>
            	<h3>Sign in to Receive Drop</h3>
            	<button onClick={() => setInsta(true)}>Sign in With Instagram</button>
            	<input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            	<br />
            	<button onClick={() => handleAddGuest()}>Create Account</button>
            </>
        
		}

	</>;
};

