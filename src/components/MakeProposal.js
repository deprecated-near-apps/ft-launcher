import React, { useState } from 'react';
import { GAS, parseNearAmount, KeyPair } from '../state/near';
import {
	getContract,
	createGuestAccount,
} from '../utils/near-utils';

export const MakeProposal = ({ near, update, localKeys, guestIsReal = false }) => {

	if (!localKeys || !localKeys.accessSecret || !guestIsReal) return null;

	const [amount, setAmount] = useState('');
	const [text, setText] = useState('');

	const handleMakeProposal = async () => {
		if (!text.length || !amount.length) {
			alert('Please enter a proposal and amount!');
			return;
		}
		update('loading', true);
		const guestAccount = createGuestAccount(near, KeyPair.fromString(localKeys.accessSecret));
		const contract = getContract(guestAccount);
		try {
			await contract.make_proposal({
				text,
				amount: parseNearAmount(amount),
			}, GAS);
		} catch (e) {
			console.warn(e);
		}
		update('loading', false);
	};

	return <>
		<h2>Make Your Proposal</h2>
		<br />
		<input placeholder="Proposal" value={text} onChange={(e) => setText(e.target.value)} />
		<input placeholder="Amount (wNEAR)" value={amount} onChange={(e) => setAmount(e.target.value)} />
		<br />
		<button onClick={() => handleMakeProposal()}>Make Proposal</button>
	</>;
};

