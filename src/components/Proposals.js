import React, { useEffect, useState } from 'react';
import * as nearAPI from 'near-api-js';
import { GAS, formatNearAmount, parseNearAmount, KeyPair } from '../state/near';
import {
	createGuestAccount,
	contractName,
	getContract,
} from '../utils/near-utils';

export const Proposals = ({ near, update, account, localKeys }) => {
	if (!account) return <p>Sign in with Wallet to browse proposals.</p>;

	if (!localKeys || !localKeys.accessSecret) return <p>Make a proposal with a guest account.</p>;

	const [proposal, setProposal] = useState('');

	useEffect(() => {
		if (localKeys && localKeys.accountId) {
			loadProposal(localKeys.accountId);
		}
	}, []);

	const loadProposal = async (accountId) => {
		const contract = getContract(account);
		try {
			setProposal(await contract.get_proposal({ owner_id: accountId }));
		} catch(e) {
			console.warn(e);
		}
	};

	const handleFundProposal = async () => {
		const owner_id = localKeys.accountId;
		update('loading', true);
		const contract = getContract(account);
		try {
			await contract.fund_proposal({
				owner_id
			}, GAS, 1);
		} catch (e) {
			console.warn(e);
		}
		update('loading', false);
	};

	const handleRemoveProposal = async () => {
		const owner_id = localKeys.accountId;
		const guestAccount = createGuestAccount(near, KeyPair.fromString(localKeys.accessSecret));
		const contract = getContract(guestAccount);
		console.log(contract);
		update('loading', true);
		try {
			await contract.remove_proposal({
				owner_id
			}, GAS);
		} catch (e) {
			console.warn(e);
		}
		update('loading', false);
	};

	return <>
		<h2>Current Proposals</h2>
		{
			proposal ? <div className="item">
				<p>{proposal.text}</p>
				<p>{formatNearAmount(proposal.amount, 2)} wNEAR</p>
				<div className="line"></div>
				<button onClick={() => handleFundProposal()}>Fund Proposal</button><span>As Wallet User</span>
				<div className="line"></div>
                
				<button onClick={() => handleRemoveProposal()}>Remove Proposal</button><span>As Guest User</span>
			</div> : <p>Make a proposal under the Guest tab.</p>
		}
	</>;
};

