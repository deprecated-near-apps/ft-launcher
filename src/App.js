import React, { useContext, useEffect } from 'react';

import { appStore, onAppMount } from './state/app';

import { Wallet } from './components/Wallet';
import { Guest } from './components/Guest';
import { Drop } from './components/Drop';
import { Launcher } from './components/Launcher';
import NearLogo from 'url:./img/near_icon.svg';

import './App.scss';

const App = () => {
	const { state, dispatch, update } = useContext(appStore);

	const { 
		loading, tabIndex,
		near, wallet, account,
		guests,

		deployedToken, guestsAccount
	} = state;

	const onMount = () => {
		dispatch(onAppMount());
	};
	useEffect(onMount, []);

	if (loading) {
		return <div className="loading">
			<img src={NearLogo} />
		</div>;
	}

	if (window.location.href.indexOf('drop') > 0) {
		return <div className="root">

			<div className="tab-controls">
				{
					['Wallet', 'Drop'].map((str, i) => 
						<div key={i}
							className={tabIndex === i ? 'active' : ''}
							onClick={() => update('tabIndex', i)}
						>{str}</div>
					)
				}
			</div>

			<div className={['tab', tabIndex === 0 ? 'active' : ''].join(' ')}>
                
				{ !account && <>
					<h3>NEAR Wallet</h3>
					<p>Sign in with a wallet that already has NEAR tokens, and you will be presented with an option to purchase tokens you can then fund proposals with.</p>
				</>}
				<Wallet {...{ wallet, account, update, deployedToken }} />

			</div>
			<div className={['tab', tabIndex === 1 ? 'active' : ''].join(' ')}>

				<Drop {...{
					near, update,
					deployedToken, guestsAccount, guests
				}} />

			</div>

			
			<div className={['tab', tabIndex === 2 ? 'active' : ''].join(' ')}>
				<Launcher {...{ near, update, account, deployedToken, guestsAccount }} />
			</div>
			
		</div>;
	}

	return (
		<div className="root">

			<div className="tab-controls">
				{
					['Wallet', 'Launch', 'Drop'].map((str, i) => 
						<div key={i}
							className={tabIndex === i ? 'active' : ''}
							onClick={() => update('tabIndex', i)}
						>{str}</div>
					)
				}
			</div>

			<div className={['tab', tabIndex === 0 ? 'active' : ''].join(' ')}>
                
				{ !account && <>
					<h3>NEAR Wallet</h3>
					<p>Sign in with a wallet that already has NEAR tokens, and you will be presented with an option to purchase tokens you can then fund proposals with.</p>
				</>}
				<Wallet {...{ wallet, account, update, deployedToken }} />

			</div>
			<div className={['tab', tabIndex === 1 ? 'active' : ''].join(' ')}>

				<Launcher {...{ near, update, account, deployedToken, guestsAccount }} />

			</div>
			<div className={['tab', tabIndex === 2 ? 'active' : ''].join(' ')}>

				<Guest {...{
					near, update,
					deployedToken, guestsAccount, guests
				}} />

			</div>
			
		</div>
	);
};

export default App;
