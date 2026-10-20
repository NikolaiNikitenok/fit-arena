import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTelegram } from './telegram';
import { initAudio } from './audio';
import { initVoice } from './voice';
import { initTelemetry } from './telemetry';
import { ErrorBoundary } from './ErrorBoundary';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './styles.css';

initTelegram();
initTelemetry();
initAudio();
initVoice();

// Номера уровней на карте рисуются на холсте, поэтому шрифт нужен до первого кадра. Ждём недолго.
const fontReady = Promise.race([document.fonts?.load('900 44px Nunito'), new Promise((r) => setTimeout(r, 1200))]).catch(() => {});

fontReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  // Заставка из index.html уходит, когда первый кадр игры уже нарисован.
  requestAnimationFrame(() => requestAnimationFrame(() => (window as { __splashDone?: () => void }).__splashDone?.()));
});
