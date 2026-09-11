(function () {
  const DEFAULT_WIDTH = 300;
  const DRIFT_EPSILON = 0.5; // diferença mínima (em %) pra considerar "reset externo"
  const SAVE_THROTTLE_MS = 300;
  const WATCHDOG_INTERVAL_MS = 1000;

  let targetWidth = DEFAULT_WIDTH;
  let currentVideo = null;
  let sliderEl = null;
  let labelEl = null;
  let wrapperEl = null;
  let isUserDragging = false;

  // lastPercent é a "fonte da verdade": o volume que o usuário escolheu.
  // É persistido no chrome.storage.local para sobreviver a recarregamentos
  // de página e é usado para "brigar de volta" sempre que o YouTube (ou
  // qualquer outra coisa) tentar resetar o volume sem o usuário pedir.
  let lastPercent = null;
  let saveTimer = null;

  function clampWidth(w) {
    return Math.max(100, Math.min(700, Number(w) || DEFAULT_WIDTH));
  }

  function clampPercent(p) {
    return Math.max(0, Math.min(100, Number(p)));
  }

  function saveVolumeThrottled(percent) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ lastVolumePercent: percent });
    }, SAVE_THROTTLE_MS);
  }

  function injectStyleOnce() {
    if (document.getElementById('yt-big-volume-style')) return;
    const style = document.createElement('style');
    style.id = 'yt-big-volume-style';
    style.textContent = `
      .yt-big-volume-wrap {
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        margin-left: 10px;
      }
      .yt-big-volume-slider {
        vertical-align: middle;
        height: 3px;
        cursor: pointer;
        accent-color: rgba(30, 144, 255, 0.65);
        opacity: 0.9;
        transition: opacity 0.15s ease;
      }
      .yt-big-volume-slider:hover {
        opacity: 1;
      }
      .yt-big-volume-slider::-webkit-slider-thumb {
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .yt-big-volume-slider:active::-webkit-slider-thumb {
        transform: scale(1.35);
        box-shadow: 0 0 6px rgba(30, 144, 255, 0.8);
      }
      .yt-big-volume-slider::-moz-range-thumb {
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .yt-big-volume-slider:active::-moz-range-thumb {
        transform: scale(1.35);
        box-shadow: 0 0 6px rgba(30, 144, 255, 0.8);
      }
      .yt-big-volume-label {
        margin-left: 8px;
        color: #fff;
        font-family: "YouTube Noto", Roboto, Arial, sans-serif;
        font-size: 12px;
        min-width: 52px;
        text-align: left;
        user-select: none;
        opacity: 0.9;
      }
    `;
    document.head.appendChild(style);
  }

  function updateLabel(percent) {
    if (labelEl) labelEl.textContent = Number(percent).toFixed(2).replace('.', ',') + '%';
  }

  // Avisa o "cérebro" do player do YouTube sobre o novo volume.
  // Isso NÃO pode ser feito chamando player.setVolume() direto daqui, porque
  // este script roda em um "mundo isolado" e não enxerga métodos customizados
  // que o YouTube anexa no elemento (.setVolume, .mute, .unMute) — eles só
  // existem no mundo principal da página. Por isso disparamos um evento que
  // o page-bridge.js (que roda no mundo principal) escuta e executa por nós.
  function applyVolumeViaOfficialApi(percent) {
    document.dispatchEvent(new CustomEvent('yt-big-volume-set', { detail: { percent } }));
  }

  // Força o volume real (vídeo + API oficial) para o valor definido pelo
  // usuário. Usado tanto quando o usuário mexe no slider quanto quando
  // detectamos que algo tentou resetar o volume por fora.
  function enforceVolume(percent) {
    applyVolumeViaOfficialApi(percent);
    if (currentVideo) {
      currentVideo.volume = percent / 100;
      currentVideo.muted = percent <= 0;
    }
  }

  function setVolumeFromUser(percent) {
    const clamped = clampPercent(percent);
    lastPercent = clamped;
    enforceVolume(clamped);
    saveVolumeThrottled(clamped);
    if (sliderEl) sliderEl.value = String(clamped);
    updateLabel(clamped);
  }

  function createSliderGroup() {
    const wrap = document.createElement('span');
    wrap.className = 'yt-big-volume-wrap';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '0.01';
    input.className = 'yt-big-volume-slider';

    const label = document.createElement('span');
    label.className = 'yt-big-volume-label';
    label.textContent = '100,00%';

    input.addEventListener('pointerdown', () => { isUserDragging = true; });
    input.addEventListener('pointerup', () => { isUserDragging = false; });

    input.addEventListener('input', () => {
      if (!currentVideo) return;
      setVolumeFromUser(Number(input.value));
    });

    wrap.appendChild(input);
    wrap.appendChild(label);

    sliderEl = input;
    labelEl = label;
    wrapperEl = wrap;
    return wrap;
  }

  // Chamada sempre que o volume do vídeo muda (evento nativo 'volumechange')
  // e também periodicamente pelo "vigia" (watchdog). Em vez de simplesmente
  // aceitar o que veio, comparamos com o valor que o usuário escolheu
  // (lastPercent). Se for muito diferente, tratamos como um reset externo
  // indesejado e reaplicamos o valor certo na hora.
  function reconcileVolume() {
    if (!sliderEl || !currentVideo || isUserDragging) return;

    const actual = currentVideo.muted ? 0 : currentVideo.volume * 100;

    if (lastPercent === null) {
      // Ainda não temos um valor definido pelo usuário; aceita o atual como ponto de partida.
      lastPercent = actual;
      sliderEl.value = String(actual);
      updateLabel(actual);
      return;
    }

    const drifted = Math.abs(actual - lastPercent) > DRIFT_EPSILON;
    if (drifted) {
      // Reset externo detectado — briga de volta.
      enforceVolume(lastPercent);
      sliderEl.value = String(lastPercent);
      updateLabel(lastPercent);
    }
  }

  function applyWidth() {
    if (sliderEl) {
      sliderEl.style.setProperty('width', targetWidth + 'px', 'important');
    }
  }

  function ensureInjected() {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const volumeArea = document.querySelector('.ytp-volume-area');
    if (!video || !volumeArea) return;

    injectStyleOnce();

    if (video !== currentVideo) {
      if (currentVideo) currentVideo.removeEventListener('volumechange', reconcileVolume);
      currentVideo = video;
      currentVideo.addEventListener('volumechange', reconcileVolume);

      // Se já temos um volume definido (do usuário ou do storage), reaplica
      // no vídeo novo imediatamente, antes que o YouTube tenha chance de
      // jogar para o padrão (100%).
      if (lastPercent !== null) {
        enforceVolume(lastPercent);
      }
    }

    // Esconde o slider nativo (mantém o botão de mudo funcionando normalmente)
    const nativePanel = volumeArea.querySelector('.ytp-volume-panel');
    if (nativePanel && nativePanel.style.display !== 'none') {
      nativePanel.style.setProperty('display', 'none', 'important');
    }

    // Injeta nosso slider + label, se ainda não estiver lá
    if (!wrapperEl || !volumeArea.contains(wrapperEl)) {
      const group = createSliderGroup();
      volumeArea.appendChild(group);
      applyWidth();
      if (lastPercent !== null) {
        sliderEl.value = String(lastPercent);
        updateLabel(lastPercent);
      } else {
        reconcileVolume();
      }
    }
  }

  const observer = new MutationObserver(() => ensureInjected());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Vigia periódico: reforça o volume mesmo se, por algum motivo, o evento
  // 'volumechange' não disparar para o reset em questão.
  setInterval(reconcileVolume, WATCHDOG_INTERVAL_MS);

  chrome.storage.sync.get({ volumeSliderWidth: DEFAULT_WIDTH }, (items) => {
    targetWidth = clampWidth(items.volumeSliderWidth);
    applyWidth();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.volumeSliderWidth) {
      targetWidth = clampWidth(changes.volumeSliderWidth.newValue);
      applyWidth();
    }
    if (area === 'local' && changes.lastVolumePercent) {
      // Volume ajustado em outra aba do YouTube; segue o valor mais recente.
      const newVal = changes.lastVolumePercent.newValue;
      if (typeof newVal === 'number' && newVal !== lastPercent) {
        lastPercent = newVal;
        enforceVolume(newVal);
      }
    }
  });

  // Carrega o volume salvo antes de qualquer coisa, para já nascer com o
  // valor certo assim que o player aparecer.
  chrome.storage.local.get({ lastVolumePercent: null }, (items) => {
    if (typeof items.lastVolumePercent === 'number') {
      lastPercent = items.lastVolumePercent;
    }
    ensureInjected();
  });

  [500, 1500, 3000].forEach((ms) => setTimeout(ensureInjected, ms));
})();
