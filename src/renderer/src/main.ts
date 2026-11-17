import './styles.css';
import { AppController } from './controllers/AppController';
import { BackendService } from './services/BackendService';
import { createInitialState } from './state/AppState';
import { Store } from './state/Store';
import { DiagnosticsView } from './views/DiagnosticsView';
import { NoticeBannerView } from './views/NoticeBannerView';
import { ScorePanelView } from './views/ScorePanelView';
import { StatusBarView } from './views/StatusBarView';
import { ToolbarView } from './views/ToolbarView';

function bootstrap(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');

  const store = new Store(createInitialState());
  const controller = new AppController(store, new BackendService());

  root.append(
    new ToolbarView(store, controller).element,
    new StatusBarView(store, controller).element,
    new NoticeBannerView(store, controller).element,
    new ScorePanelView(store, controller).element,
    new DiagnosticsView(store).element,
  );

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      void controller.toggleSession();
    }
  });

  controller.initialize().catch((error: unknown) => {
    console.error('Initialisation failed', error);
  });
}

bootstrap();
