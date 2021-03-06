import React, { useEffect, useState } from 'react';
import * as nearAPI from 'near-api-js';
import {
    GAS,
} from '../utils/near-utils';
const {
    KeyPair, Account, Contract,
    utils: { PublicKey, format: { formatNearAmount, parseNearAmount } }
} = nearAPI;

export const Wallet = ({ wallet, account, update, deployedToken }) => {

    const [tokenBalance, setTokenBalance] = useState() 

    useEffect(() => {
        if (account && deployedToken) updateWallet()
    }, [account, deployedToken])

    const updateWallet = async () => {
        console.log(await account.viewFunction(deployedToken.accountId, 'ft_balance_of', { account_id: account.accountId }))
        setTokenBalance(formatNearAmount(await account.viewFunction(deployedToken.accountId, 'ft_balance_of', { account_id: account.accountId }) || '0'));
    }

    const handleTransfer = async () => {
        const receiver_id = window.prompt('receiver_id?')
        const amount = parseNearAmount(window.prompt('amount?'))
        if (!receiver_id.length || !amount.length) return
        update('loading', true);
        await account.functionCall(deployedToken.accountId, 'ft_transfer_guest', { receiver_id, amount }, GAS);
        updateWallet()
        update('loading', false);
    }

	if (wallet && wallet.signedIn) {
		return <>
			<h3>Wallet Account</h3>
			<p>Signed In: { account.accountId }</p>
			<p>Balance NEAR: { wallet.balance }</p>
			<p>Balance Tokens: { tokenBalance || '0' }</p>
            <button onClick={() => handleTransfer()}>Transfer</button>
            <br/>
            <br/>
			<button onClick={() => wallet.signOut()}>Sign Out</button>
		</>;
	}

	return <>
		<p>Sign in with your NEAR Wallet</p>
		<button onClick={() => wallet.signIn()}>Sign In</button>
	</>;
};

