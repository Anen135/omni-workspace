import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace } from './app/Workspace';
import './styles/styles.css';
import './styles/pages.css';
import './components/ui/help.css';
import './styles/theme.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace/></React.StrictMode>);
