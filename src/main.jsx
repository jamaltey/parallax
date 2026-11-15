import { createRoot } from 'react-dom/client';
import App from './App';
import Community from './citizen/Community';
import Developers from './components/Developers';
import './styles.css';

const match = window.location.pathname.match(/^\/community(?:\/([^/]+))?\/?$/);
createRoot(document.getElementById('root')).render(
  window.location.pathname.replace(/\/$/, '') === '/developers' ? (
    <Developers />
  ) : match ? (
    <Community candidateId={match[1]} />
  ) : (
    <App />
  )
);
