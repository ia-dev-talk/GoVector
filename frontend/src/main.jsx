import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { api } from './api/client';
import { installExhaustiveCollectionFetching } from './api/exhaustiveCollections';
import './styles/index.css';
import './styles/bluevector-v3.css';
import './styles/ux-readability-v2.css';
import './styles/sector-flow-v2.css';
import './styles/shell-v08.css';
import './styles/operations-final-v08.css';
import './styles/intervention-v08-layout.css';
import './styles/stock-responsive-v08.css';
import './styles/supervision-responsive-v08.css';
import './styles/cockpit-readability-v08.css';
import './styles/stock-scope-final-v08.css';
import './styles/delivery-pilot.css';
import './styles/delivery-final-fixes.css';
import './styles/delivery-contrast-guard.css';

installExhaustiveCollectionFetching(api);

ReactDOM.createRoot(document.getElementById('root')).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
