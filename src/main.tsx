import React from 'react';
import { createRoot } from 'react-dom/client';
import DemoApp from './demo/DemoApp';
import './styles/styles.css';
import './styles/theme.css';
import './components/ui/help.css';
import './styles/redesign.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><DemoApp/></React.StrictMode>);
