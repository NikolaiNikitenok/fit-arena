import { Component, type ErrorInfo, type ReactNode } from 'react';
import { flush, reportError } from './telemetry';

/** Падение интерфейса: вместо чёрного экрана — понятное сообщение и перезапуск. Ошибка уходит в отчёт. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError('react', error, info.componentStack?.slice(0, 600));
    void flush();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="onboarding crash">
        <div className="onb-card">
          <div className="onb-title">Что-то сломалось</div>
          <div className="onb-text">Игра споткнулась, но прогресс сохранён. Мы уже получили отчёт об ошибке и починим её. Перезапусти, чтобы продолжить.</div>
          <button className="primary" onClick={() => location.reload()}>
            Перезапустить
          </button>
        </div>
      </div>
    );
  }
}
