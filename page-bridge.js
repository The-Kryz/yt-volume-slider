// Este arquivo roda no MESMO contexto JavaScript da página do YouTube
// (declarado com "world": "MAIN" no manifest.json), por isso ele consegue
// enxergar os métodos customizados que o YouTube anexa no #movie_player
// (.setVolume, .mute, .unMute, .isMuted), coisa que um content script
// isolado normalmente NÃO consegue ver.
//
// A comunicação com o content.js (que fica no mundo isolado, com acesso
// ao chrome.storage) acontece via CustomEvent no document.

document.addEventListener('yt-big-volume-set', (event) => {
  try {
    const percent = event.detail && event.detail.percent;
    if (typeof percent !== 'number') return;

    const player = document.getElementById('movie_player');
    if (!player || typeof player.setVolume !== 'function') return;

    if (percent <= 0) {
      player.mute();
    } else {
      if (typeof player.isMuted === 'function' && player.isMuted()) {
        player.unMute();
      }
      player.setVolume(Math.round(percent));
    }
  } catch (e) {
    // Silenciosamente ignora se a API do player ainda não estiver pronta
  }
});
