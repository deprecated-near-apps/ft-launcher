import React, { useState, useEffect } from 'react';
import * as nearAPI from 'near-api-js';
import { get, set, del } from '../utils/storage';
import { generateSeedPhrase } from 'near-seed-phrase';
import {
    networkId,
    setSignerFromSeed,
    GAS,
    isAccountTaken,
    tokenMethods,
} from '../utils/near-utils';

const GUEST_ACCOUNTS = '__GUEST_ACCOUNTS';

const {
    KeyPair, Account, Contract,
    utils: { PublicKey, format: { formatNearAmount, parseNearAmount } }
} = nearAPI;

export const Guest = ({
    near, update, guests = [],
    deployedToken, guestsAccount,
}) => {
    if (!guestsAccount) return null;

    const [username, setUsername] = useState('');

    useEffect(() => {
        loadGuests()
    }, []);

    const loadGuests = async () => {
        /// hydrate guests
        const guests = get(GUEST_ACCOUNTS, []);
        for (let i = 0; i < guests.length; i++) {
            const guestAccount = new Account(near.connection, guestsAccount.accountId);
            setSignerFromSeed(guestsAccount.accountId, guests[i].seedPhrase)
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

        setSignerFromSeed(guestsAccount.accountId, guestsAccount.seedPhrase)

        try {
            await guestAccount.addKey(publicKey, tokenAccount.accountId, tokenMethods.changeMethods, parseNearAmount('0.1'));
            await tokenAccount.functionCall(deployedToken.accountId, 'add_guest', { account_id: accountId, public_key: publicKey }, GAS);
            const guest = { accountId, publicKey, seedPhrase, created: Date.now() };
            guests.push(guest);
            console.log('guests', guests);
            update('guests', guests);
            set(GUEST_ACCOUNTS, guests);
        } catch(e) {
            console.warn(e)
        }

        update('loading', false);
    };

    const handleClaimDrop = async (_accountId) => {
        const i = guests.findIndex(({ accountId }) => accountId === _accountId)
        if (i < 0) return
        update('loading', true);
        const { seedPhrase, publicKey } = guests[i]
        /// set signer to this guest for guests account
        const guestAccount = new Account(near.connection, guestsAccount.accountId);
        setSignerFromSeed(guestsAccount.accountId, seedPhrase)
        try {
            await guestAccount.functionCall(deployedToken.accountId, 'claim_drop', {}, GAS);
        } catch(e) {
            console.warn(e)
        }
        loadGuests()
        update('loading', false);
    }

    const handleTransfer = async (_accountId) => {
        const i = guests.findIndex(({ accountId }) => accountId === _accountId)
        if (i < 0) return
        const { seedPhrase, publicKey } = guests[i]
        /// set signer to this guest for guests account
        const guestAccount = new Account(near.connection, guestsAccount.accountId);
        setSignerFromSeed(guestsAccount.accountId, seedPhrase)
        const receiver_id = window.prompt('receiver_id?')
        const amount = parseNearAmount(window.prompt('amount?'))
        if (!receiver_id.length || !amount.length) return
        update('loading', true);
        try {
            await guestAccount.functionCall(deployedToken.accountId, 'ft_transfer_guest', { receiver_id, amount }, GAS);
        } catch(e) {
            console.log(e)
        }
        loadGuests()
        update('loading', false);
    }

    const handleUpgrade = async (_accountId) => {
        const i = guests.findIndex(({ accountId }) => accountId === _accountId)
        if (i < 0) return
        /// the new full access key
        const { seedPhrase, publicKey } = generateSeedPhrase();
        if (!window.prompt('keep this somewhere safe', seedPhrase)) {
            return alert('you have to copy the seed phrase down somewhere')
        }
        console.log('seedPhrase', seedPhrase)
        /// additional access key so upgraded user doens't have to sign in with wallet
        const { seedPhrase: accessSeed, secretKey: accessSecret, publicKey: accessPublic } = generateSeedPhrase();

        /// current guest credentials
        const { accountId, seedPhrase: guestSeed } = guests[i]
        /// prep contract and args
        const guestAccount = new Account(near.connection, guestsAccount.accountId);
        setSignerFromSeed(guestsAccount.accountId, guestSeed)
        update('loading', true);
        const public_key = publicKey.toString();
        try {
            await guestAccount.functionCall(deployedToken.accountId, 'upgrade_guest', {
                public_key,
                access_key: accessPublic,
                method_names: tokenMethods.changeMethods.join(',')
            }, GAS);

            /// wallet hijacking
            set(`near-api-js:keystore:${accountId}:default`, accessSecret);

            console.log(`undefined_wallet_auth_key`, `{"accountId":"${accountId}","allKeys":["${accessPublic}"]}`)

            set(`undefined_wallet_auth_key`, `{"accountId":"${accountId}","allKeys":["${accessPublic}"]}`);
            /// set to access key pair, still a guest 
            /// e.g. don't have to get full access key secret from app (can use wallet /extention)
            const accessKeyPair = KeyPair.fromString(accessSecret)
            near.connection.signer.keyStore.setKey(networkId, accountId, accessKeyPair);
            guests[i].upgraded = true
            guests[i].seedPhrase = accessSeed
            set(GUEST_ACCOUNTS, guests);
            update('guests', guests);
            update('loading', false);
            /// because we hacked the wallet
            window.location.reload();
        } catch (e) {
            console.warn(e);
            alert('upgrading failed')
        }
    };

    const handleRemoveGuest = async (_accountId) => {
        const i = guests.findIndex(({ accountId }) => accountId === _accountId)
        if (i < 0) return
        update('loading', true);
        try {
            const tokenAccount = new Account(near.connection, deployedToken.accountId);
            await tokenAccount.functionCall(deployedToken.accountId, 'remove_guest', { public_key: guests[i].publicKey }, GAS);
            guests.splice(i, 1)
            update('guests', guests);
            set(GUEST_ACCOUNTS, guests);
        } catch(e) {
            console.warn(e)
        }
        update('loading', false);
    };

    return <>
        <>
            <h3>Guests</h3>
            { !guests.length && <p>No Guests</p> }
            {
                guests.filter((g) => !g.upgraded).map(({ accountId, balance = '0' }, i) => <div key={accountId}>
                    <p>{accountId} - {formatNearAmount(balance, 2)} tokens</p>
                    <button onClick={() => handleClaimDrop(accountId)}>Claim Drop</button>
                    <button onClick={() => handleTransfer(accountId)}>Transfer</button>
                    <button onClick={() => handleUpgrade(accountId)}>Upgrade</button>
                    <button onClick={() => handleRemoveGuest(accountId)}>Remove</button>
                </div>)
            }
        </>

        <>
            <h3>Add Guest Account</h3>
            <p>Creates a key pair to interact with the app. Normally you would set up your wallet and add an access key for the app.</p>
            <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <br />
            <button onClick={() => handleAddGuest()}>Add Account</button>
        </>

    </>;
};

