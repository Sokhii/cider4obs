// Constants
const CIDER_SOCKET_URL = "http://localhost:10767";
const SETTINGS_LOAD_DELAY = 100;
const DEFAULT_FADE_DELAY = 2000;
const DEFAULT_QUEUE_REVEAL_TIME = 10;

// Element IDs
const ELEMENTS = {
  content: 'content',
  title: 'title',
  artist: 'artist',
  album: 'album',
  albumImg: 'albumimg',
  progressBar: 'progressBar',
  currentTime: 'currentTime',
  duration: 'duration',
  nextInQueue: 'nextInQueue',
  nextQueueBox: 'nextQueueBox',
  nextTitle: 'nextTitle',
  nextArtist: 'nextArtist',
  nextAlbumImg: 'nextAlbumImg'
};

// State
let pauseTimer;
let disconnectTimer;
let settings;
let elements = {};
let currentTrackName = null;

function cacheElements() {
  Object.keys(ELEMENTS).forEach(key => {
    elements[key] = document.getElementById(ELEMENTS[key]);
  });
  
  if (elements.nextQueueBox && settings) {
    const direction = settings.next_in_queue_slide_direction;
    if (['top', 'bottom', 'left', 'right'].includes(direction)) {
      elements.nextQueueBox.setAttribute('data-slide', direction);
    }
  }
}

function getCSSVariable(name) {
  return window.getComputedStyle(document.body).getPropertyValue(name);
}

function getSettings() {
  return {
    fade_on_stop: getCSSVariable('--fade-on-stop') === '1',
    fade_on_disconnect: getCSSVariable('--fade-on-disconnect') === '1',
    fade_delay: parseInt(getCSSVariable('--fade-delay')) || DEFAULT_FADE_DELAY,
    fade_disconnect_delay: parseInt(getCSSVariable('--fade-disconnect-delay')) || 
                          parseInt(getCSSVariable('--fade-delay')) || DEFAULT_FADE_DELAY,
    hide_on_idle_connect: getCSSVariable('--hide-on-idle-connect') === '1',
    hide_unless_playing: getCSSVariable('--hide-unless-playing') === '1',
    show_time_labels: getCSSVariable('--show-time-labels') === '1',
    show_next_in_queue: getCSSVariable('--show-next-in-queue') === '1',
    next_in_queue_reveal_time: parseInt(getCSSVariable('--next-in-queue-reveal-time')) || DEFAULT_QUEUE_REVEAL_TIME,
    next_in_queue_slide_direction: getCSSVariable('--next-in-queue-slide-direction').trim() || 'top'
  };
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function setOpacity(element, value, delay = 0) {
  if (delay > 0) {
    return setTimeout(() => {
      if (element) element.style.opacity = value;
    }, delay);
  }
  if (element) element.style.opacity = value;
  return null;
}

function clearTimer(timer) {
  if (timer) clearTimeout(timer);
  return undefined;
}

function updateComponents(data) {
  if (!data) return;
  const info = data.attributes || data;

  if (elements.title) elements.title.innerText = info.name || "Unknown Title";
  if (elements.artist) elements.artist.innerText = info.artistName || "Unknown Artist";
  if (elements.album) elements.album.innerText = info.albumName || "";
  
  currentTrackName = info.name;
  
  if (info.artwork && info.artwork.url) {
    // FIX: Added {f} replacement so Apple Music knows it's a JPG
    const artworkUrl = info.artwork.url
      .replace("{w}", "512")
      .replace("{h}", "512")
      .replace("{f}", "jpg");
      
    if (elements.albumImg) {
        elements.albumImg.src = artworkUrl;
        elements.albumImg.style.display = "block";
    }
  } else if (elements.albumImg) {
    elements.albumImg.src = "c4obs.png";
  }
}

async function fetchNowPlaying() {
  return true; 
}

async function fetchQueue() {
  if (!settings || !settings.show_next_in_queue) return;
  try {
    const response = await fetch(`${CIDER_SOCKET_URL}/api/v1/playback/queue`);
    const queue = await response.json();
    if (Array.isArray(queue) && queue.length > 0 && currentTrackName) {
      const currentIndex = queue.findIndex(track => 
        track.attributes && track.attributes.name === currentTrackName
      );
      if (currentIndex >= 0 && currentIndex < queue.length - 1) {
        const nextTrack = queue[currentIndex + 1];
        if (nextTrack.attributes) {
          updateNextInQueue(nextTrack.attributes);
          return;
        }
      }
    }
    hideNextInQueue();
  } catch (error) {
    hideNextInQueue();
  }
}

function updateNextInQueue(data) {
  if (elements.nextTitle) elements.nextTitle.innerText = data.name;
  if (elements.nextArtist) elements.nextArtist.innerText = data.artistName;
  if (data.artwork && data.artwork.url && elements.nextAlbumImg) {
    // FIX: Added {f} replacement here too
    elements.nextAlbumImg.src = data.artwork.url
        .replace("{w}", "120")
        .replace("{h}", "120")
        .replace("{f}", "jpg");
  }
}

function hideNextInQueue() {
  if (elements.nextInQueue) elements.nextInQueue.classList.remove('visible');
}

function checkQueueReveal(currentTime, duration) {
  if (!settings || !settings.show_next_in_queue) return;
  const timeRemaining = duration - currentTime;
  const shouldReveal = timeRemaining <= settings.next_in_queue_reveal_time && timeRemaining > 0.5;
  if (shouldReveal && elements.nextTitle && elements.nextTitle.innerText !== '-') {
    elements.nextInQueue.classList.add('visible');
  } else if (elements.nextInQueue) {
    elements.nextInQueue.classList.remove('visible');
  }
}

function handlePlaybackStateChange(state) {
  if (!settings) return;
  if (state === "paused" && !pauseTimer && (settings.fade_on_stop || settings.hide_unless_playing)) {
    pauseTimer = setOpacity(elements.content, 0, settings.fade_delay);
  } else if (state === "playing") {
    pauseTimer = clearTimer(pauseTimer);
    if (elements.content) elements.content.style.opacity = 1;
  }
}

async function handleConnect() {
  console.debug('[DEBUG] [Init] Socket.io connection established!');
  
  if (!settings) {
    settings = getSettings();
    cacheElements();
  }

  const hasTrack = await fetchNowPlaying();
  
  if (settings && settings.show_next_in_queue) {
    await fetchQueue();
  }
  
  if (!hasTrack && elements.title) {
    elements.title.innerText = "Cider4OBS Connector | Connection established!";
  }

  if (elements.content && settings) {
    elements.content.style.opacity = (settings.hide_on_idle_connect || settings.hide_unless_playing) ? 0 : 1;
  }
}

function handleDisconnect() {
  if (elements.title) elements.title.innerText = "Disconnected! Retrying...";
  if (elements.albumImg) elements.albumImg.src = "c4obs.png";

  if (settings && settings.hide_unless_playing && elements.content) {
    elements.content.style.opacity = 0;
  }
}

function handlePlaybackEvent({ data, type }) {
  switch (type) {
    case "playbackStatus.playbackStateDidChange":
      handlePlaybackStateChange(data.state);
      updateComponents(data.attributes || data);
      break;
    case "playbackStatus.nowPlayingItemDidChange":
      updateComponents(data.attributes || data);
      fetchQueue();
      break;
    case "playbackStatus.playbackTimeDidChange":
      if (elements.progressBar) {
        elements.progressBar.style.width = `${(data.currentPlaybackTime / data.currentPlaybackDuration) * 100}%`;
      }
      if (settings && settings.show_time_labels) {
        if (elements.currentTime) elements.currentTime.innerText = formatTime(data.currentPlaybackTime);
        if (elements.duration) elements.duration.innerText = formatTime(data.currentPlaybackDuration);
      }
      checkQueueReveal(data.currentPlaybackTime, data.currentPlaybackDuration);
      break;
  }
}

function startWebSocket() {
  try {
    setTimeout(() => {
      settings = getSettings();
      cacheElements();
    }, SETTINGS_LOAD_DELAY);

    const CiderApp = io(CIDER_SOCKET_URL, { transports: ['websocket'] });
    CiderApp.on("connect", handleConnect);
    CiderApp.on("API:Playback", handlePlaybackEvent);
    CiderApp.on("disconnect", handleDisconnect);
  } catch (error) {
    console.debug('[DEBUG] [Init] Code error:', error);
  }
}
