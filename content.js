(function () {
  const DEFAULT_WIDTH = 300;
  let targetWidth = DEFAULT_WIDTH;
  let currentVideo = null;
  let sliderEl = null;
  let labelEl = null;
  let wrapperEl = null;
  let isUserDragging = false;

  function clampWidth(w) {
    return Math.max(100, Math.min(700, Number(w) || DEFAULT_WIDTH));
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
      const percent = Number(input.value);
      currentVideo.volume = percent / 100;
      currentVideo.muted = percent === 0;
      updateLabel(percent);
    });

    wrap.appendChild(input);
    wrap.appendChild(label);

    sliderEl = input;
    labelEl = label;
    wrapperEl = wrap;
    return wrap;
  }

  function syncSliderFromVideo() {
    if (!sliderEl || !currentVideo || isUserDragging) return;
    const val = currentVideo.muted ? 0 : currentVideo.volume * 100;
    sliderEl.value = String(val);
    updateLabel(val);
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
      if (currentVideo) currentVideo.removeEventListener('volumechange', syncSliderFromVideo);
      currentVideo = video;
      currentVideo.addEventListener('volumechange', syncSliderFromVideo);
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
      syncSliderFromVideo();
    }
  }

  const observer = new MutationObserver(() => ensureInjected());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.sync.get({ volumeSliderWidth: DEFAULT_WIDTH }, (items) => {
    targetWidth = clampWidth(items.volumeSliderWidth);
    ensureInjected();
    applyWidth();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.volumeSliderWidth) {
      targetWidth = clampWidth(changes.volumeSliderWidth.newValue);
      applyWidth();
    }
  });

  [500, 1500, 3000].forEach((ms) => setTimeout(ensureInjected, ms));
})();
