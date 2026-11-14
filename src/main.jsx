import { createRoot } from 'react-dom/client';
import App from './App';
import Community from './citizen/Community';
import './styles.css';

const match = window.location.pathname.match(/^\/community(?:\/([^/]+))?\/?$/);
createRoot(document.getElementById('root')).render(
  match ? <Community candidateId={match[1]} /> : <App />
);
