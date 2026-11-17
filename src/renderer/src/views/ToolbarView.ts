import type { AppController } from '../controllers/AppController';
import { isSessionActive, startBlockedReason, type AppState, type SourceKind } from '../state/AppState';
import type { Store } from '../state/Store';
import { el, setText, setVisible } from '../util/dom';
import { fileNameOf } from '../util/format';

export class ToolbarView {
  readonly element: HTMLElement;

  private readonly scoreButton: HTMLButtonElement;
  private readonly sourceButtons: Record<SourceKind, HTMLButtonElement>;
  private readonly deviceSelect: HTMLSelectElement;
  private readonly wavGroup: HTMLElement;
  private readonly wavButton: HTMLButtonElement;
  private readonly wavOffset: HTMLInputElement;
  private readonly sessionButton: HTMLButtonElement;
  private readonly sessionLabel: HTMLSpanElement;
  private renderedDevicesKey = '';

  constructor(store: Store<AppState>, controller: AppController) {
    this.scoreButton = el('button', { className: 'button file-button', onclick: () => void controller.openScore() });

    const sourceButton = (kind: SourceKind, label: string) =>
      el('button', { className: 'segment', onclick: () => controller.setSourceKind(kind) }, label);
    this.sourceButtons = { microphone: sourceButton('microphone', 'Microphone'), wav: sourceButton('wav', 'Recording (WAV)') };

    this.deviceSelect = el('select', {
      className: 'select',
      title: 'Input device',
      onchange: () => controller.setInputDevice(Number(this.deviceSelect.value)),
    });

    this.wavButton = el('button', { className: 'button file-button', onclick: () => void controller.chooseWavFile() });
    this.wavOffset = el('input', {
      className: 'input offset-input',
      type: 'number',
      min: '0',
      step: '0.5',
      title: 'Where to start in the recording (seconds)',
      onchange: () => controller.setWavStartOffset(Number(this.wavOffset.value)),
    });
    this.wavGroup = el(
      'div',
      { className: 'group' },
      this.wavButton,
      el('label', { className: 'muted small' }, 'start at ', this.wavOffset, ' s'),
    );

    this.sessionLabel = el('span', { className: 'transport-label' });
    this.sessionButton = el(
      'button',
      { className: 'transport', onclick: () => void controller.toggleSession() },
      el('span', { className: 'transport-glyph' }),
      this.sessionLabel,
    );

    this.element = el(
      'header',
      { className: 'toolbar' },
      this.scoreButton,
      el(
        'div',
        { className: 'group' },
        el('div', { className: 'segmented' }, this.sourceButtons.microphone, this.sourceButtons.wav),
        this.deviceSelect,
        this.wavGroup,
      ),
      el('div', { className: 'push-right' }, this.sessionButton),
    );

    store.subscribe((state) => this.render(state));
  }

  private render(state: AppState): void {
    const locked = isSessionActive(state) || state.backend.state !== 'running';

    setVisible(this.scoreButton, state.score !== null);
    setText(this.scoreButton, state.score?.fileName ?? '');
    this.scoreButton.title = state.score ? 'Open another score' : 'Open a MusicXML score';
    this.scoreButton.disabled = locked;

    for (const kind of ['microphone', 'wav'] as const) {
      this.sourceButtons[kind].classList.toggle('selected', state.source.kind === kind);
      this.sourceButtons[kind].disabled = locked;
    }
    setVisible(this.deviceSelect, state.source.kind === 'microphone');
    setVisible(this.wavGroup, state.source.kind === 'wav');

    this.renderDevices(state);
    this.deviceSelect.disabled = locked || state.devices.length === 0;

    setText(this.wavButton, state.source.wavPath ? fileNameOf(state.source.wavPath) : 'Choose recording…');
    this.wavButton.classList.toggle('empty', !state.source.wavPath);
    this.wavButton.disabled = locked;
    if (document.activeElement !== this.wavOffset) this.wavOffset.value = String(state.source.wavStartOffsetSec);
    this.wavOffset.disabled = locked;

    this.renderSessionButton(state);
  }

  private renderSessionButton(state: AppState): void {
    const button = this.sessionButton;
    const sessionState = state.session.state;

    if (sessionState === 'preparing' || sessionState === 'tracking') {
      button.dataset['mode'] = 'stop';
      setText(this.sessionLabel, 'Stop');
      button.disabled = false;
      button.title = 'Stop following (Space)';
    } else if (sessionState === 'stopping') {
      button.dataset['mode'] = 'stop';
      setText(this.sessionLabel, 'Stopping…');
      button.disabled = true;
    } else {
      const blocked = startBlockedReason(state);
      button.dataset['mode'] = 'start';
      setText(this.sessionLabel, 'Start');
      button.disabled = blocked !== null;
      button.title = blocked ?? 'Start following your playing (Space)';
    }
  }

  private renderDevices(state: AppState): void {
    const key = state.devices.map((d) => `${d.id}:${d.name}`).join('|');
    if (key !== this.renderedDevicesKey) {
      this.renderedDevicesKey = key;
      this.deviceSelect.replaceChildren(
        ...(state.devices.length === 0
          ? [el('option', { value: '' }, 'No input devices')]
          : state.devices.map((d) => el('option', { value: String(d.id) }, d.name))),
      );
    }
    if (state.source.deviceId !== null) this.deviceSelect.value = String(state.source.deviceId);
  }
}
