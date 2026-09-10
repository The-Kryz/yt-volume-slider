const DEFAULT_WIDTH = 300;
const range = document.getElementById('widthRange');
const valueLabel = document.getElementById('valueLabel');

chrome.storage.sync.get({ volumeSliderWidth: DEFAULT_WIDTH }, (items) => {
  range.value = items.volumeSliderWidth;
  valueLabel.textContent = items.volumeSliderWidth + 'px';
});

range.addEventListener('input', () => {
  valueLabel.textContent = range.value + 'px';
  chrome.storage.sync.set({ volumeSliderWidth: Number(range.value) });
});
