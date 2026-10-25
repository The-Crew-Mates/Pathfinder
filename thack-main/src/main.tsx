import {createRoot} from 'react-dom/client';
import App from './App.tsx';

// Fonts are bundled with the app (not loaded from Google Fonts) so it works offline.
// Only the Latin alphabet is included (it covers English, Finnish and Swedish, ä ö å too),
// which keeps the offline download small.
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
