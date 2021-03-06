import React, { useEffect, useState } from 'react';
import * as nearAPI from 'near-api-js';
import { GAS, formatNearAmount, parseNearAmount } from '../state/near';
import {
	contractName,
	getContract,
} from '../utils/near-utils';
import BN from 'bn.js';

export const Contract = ({ update, account, tokenBalance = '0' }) => {

	const [amount, setAmount] = useState('');
	const [receiver, setReceiver] = useState('');
	const [transferAmount, setTransferAmount] = useState('');

	useEffect(() => {
		if (!account) return;
		loadWalletBalances();
	}, [account]);

	const loadWalletBalances = async () => {
		const contract = getContract(account);
		const storageBalance = await contract.storage_balance_of({ account_id: account.accountId });
		// console.log('token storage wallet:', storageBalance);
		const tokenBalance = await contract.ft_balance_of({ account_id: account.accountId });
		update('tokenBalance', tokenBalance);
	};

	const handleBuyTokens = async () => {
		if (!amount.length) {
			alert('Please enter amount!');
			return;
		}
		let purchaseAmount = parseNearAmount(amount);
		update('loading', true);
		const contract = getContract(account);
		const storageBalance = await contract.storage_balance_of({ account_id: account.accountId });
		const storageMinimum = await contract.storage_minimum_balance();
		if (storageBalance.total === '0' && window.confirm(`add ${formatNearAmount(storageMinimum, 6)} extra NEAR for storage?`)) {
			purchaseAmount = new BN(purchaseAmount).add(new BN(storageMinimum)).toString();
			try {
				await contract.near_deposit_with_storage({}, GAS, purchaseAmount);
			} catch (e) {
				console.warn(e);
			}
			return update('loading', false);
		}
		try {
			await contract.near_deposit({}, GAS, purchaseAmount);
		} catch (e) {
			console.warn(e);
		}
		return update('loading', false);
	};

	const handleTransferTokens = async () => {
		if (!transferAmount.length || !receiver.length) {
			alert('Please enter amount and receiver!');
			return;
		}
		update('loading', true);
		// const appAccount = createAccessKeyAccount(near, KeyPair.fromString(localKeys.accessSecret));
		const contract = getContract(account);
		try {
			await contract[receiver === contractName ? 'ft_transfer_call' : 'ft_transfer']({
				receiver_id: receiver,
				amount: parseNearAmount(transferAmount),
				msg: ''
			}, GAS, 1);
		} catch (e) {
			console.warn(e);
		}
		update('loading', false);
	};

	return <>
		{
			/// wallet is signed in
			account &&
            <>
            	{
            		tokenBalance !== '0' && <>
            			<h2>Transfer Wrapped NEAR</h2>
            			{/* <button onClick={() => handleWithdrawTokens()}>Withdraw Tokens</button> */}
            			<p>Token Balance: {formatNearAmount(tokenBalance, 2)}</p>
            			<input placeholder="Transfer Amount (N)" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} />
            			<input placeholder="Receiver Account Id" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
            			<br />
            			<button onClick={() => handleTransferTokens()}>Transfer Tokens</button>
            		</>
            	}

            	<h2>Buy Wrapped NEAR</h2>
            	<p>Token Contract is {contractName}</p>
            	<br />
            	<input placeholder="Amount (N)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            	<br />
            	<button onClick={() => handleBuyTokens()}>Buy Tokens</button>

            </>
		}

	</>;
};

