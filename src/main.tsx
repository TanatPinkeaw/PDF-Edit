import { createRoot } from 'react-dom/client';

import App from './App';
import './styles.css';
import './styles-tools.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('ไม่พบ #root ใน index.html');
}

createRoot(container).render(<App />);
