import getConfig from '../config';
import * as nearAPI from 'near-api-js';
import { getWallet, postSignedJson } from '../utils/near-utils';

export const {
	GAS,
	networkId, nodeUrl, walletUrl, nameSuffix,
	contractName,
} = getConfig();

export const {
	KeyPair,
	utils: {
		format: {
			formatNearAmount, parseNearAmount
		}
	}
} = nearAPI;

export const initNear = () => async ({ update, getState, dispatch }) => {
	const { near, wallet } = await getWallet();

	wallet.signIn = () => {
		wallet.requestSignIn(contractName, 'Blah Blah');
	};
	const signOut = wallet.signOut;
	wallet.signOut = () => {
		signOut.call(wallet);
		update('wallet.signedIn', false);
		update('account', null);
	};

	wallet.signedIn = wallet.isSignedIn();

	console.log(wallet);
    
	let account;
	if (wallet.signedIn) {
		account = wallet.account();
		const accessKeys = await account.getAccessKeys();
		/// check key for contract
		if (account.accountId.split('.').length === 2) {
			const key = accessKeys.find((k) => k.access_key && k.access_key.permission && k.access_key.permission.FunctionCall && k.access_key.permission.FunctionCall.receiver_id && k.access_key.permission.FunctionCall.receiver_id === contractName);
			if (!key) {
				wallet.signOut();
				return;
			}
		}
		wallet.balance = formatNearAmount((await wallet.account().getAccountBalance()).available, 2);
		await update('', { near, wallet, account });
	}

	await update('', { near, wallet, account });
};
