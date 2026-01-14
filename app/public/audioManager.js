(() => {
  const SOUND_PATHS = {
    click: "/assets/sounds/click.wav",
    move: "/assets/sounds/move.wav",
    eat: "/assets/sounds/eat.wav",
    blow: "/assets/sounds/blow.wav",
    buzz: "/assets/sounds/buzz.wav",
    win: "/assets/sounds/win.wav",
    lose: "/assets/sounds/lose.wav"
  };
  const STORAGE_ENABLED = "soundEnabled";
  const STORAGE_VOLUME = "soundVolume";
  const DEFAULT_VOLUME = 0.5;
  const MIN_INTERVAL_MS = 120;

  let enabled = true;
  let volume = DEFAULT_VOLUME;
  let initialized = false;
  let userInteracted = false;
  let audioMap = {};
  const lastPlayedAt = {};
  let bound = false;

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      // ignore storage errors
    }
  }

  function normalizeVolume(val) {
    const num = Number(val);
    if (Number.isNaN(num)) return DEFAULT_VOLUME;
    if (num <= 1) return Math.min(Math.max(num, 0), 1);
    const normalized = num / 10;
    return Math.min(Math.max(normalized, 0), 1);
  }

  function loadPrefs() {
    const storedEnabled = safeGet(STORAGE_ENABLED);
    if (storedEnabled === null) {
      safeSet(STORAGE_ENABLED, "true");
      enabled = true;
    } else {
      enabled = storedEnabled === "true";
    }

    const storedVolume = safeGet(STORAGE_VOLUME);
    if (storedVolume === null) {
      safeSet(STORAGE_VOLUME, DEFAULT_VOLUME.toString());
      volume = DEFAULT_VOLUME;
    } else {
      volume = normalizeVolume(storedVolume);
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    audioMap = {};
    Object.entries(SOUND_PATHS).forEach(([key, src]) => {
      try {
        const audio = new Audio(src);
        audio.preload = "auto";
        audio.volume = volume;
        audioMap[key] = audio;
        audio.load();
      } catch (_) {
        // ignore audio init errors
      }
    });
  }

  function markUserInteracted() {
    if (userInteracted) return;
    userInteracted = true;
    init();
  }

  function canPlay() {
    return enabled && userInteracted;
  }

  function play(key) {
    if (!canPlay()) return;
    if (!initialized) init();
    const audio = audioMap[key];
    if (!audio) return;
    const now = Date.now();
    if (lastPlayedAt[key] && now - lastPlayedAt[key] < MIN_INTERVAL_MS) return;
    lastPlayedAt[key] = now;
    try {
      audio.currentTime = 0;
      const res = audio.play();
      if (res && typeof res.catch === "function") {
        res.catch(() => {});
      }
    } catch (_) {
      // ignore playback errors
    }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    safeSet(STORAGE_ENABLED, enabled.toString());
  }

  function setVolume(value) {
    volume = normalizeVolume(value);
    safeSet(STORAGE_VOLUME, volume.toString());
    if (!initialized) return;
    Object.values(audioMap).forEach((audio) => {
      if (audio) audio.volume = volume;
    });
  }

  function getVolume() {
    return volume;
  }

  function isEnabled() {
    return enabled;
  }

  function bindToUserGesture() {
    if (bound) return;
    bound = true;
    const handler = () => {
      markUserInteracted();
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", handler);
      document.removeEventListener("touchstart", handler);
    };
    document.addEventListener("pointerdown", handler, { once: true });
    document.addEventListener("keydown", handler, { once: true });
    document.addEventListener("touchstart", handler, { once: true });
  }

  loadPrefs();

  window.AudioManager = {
    bindToUserGesture,
    markUserInteracted,
    playMove: () => play("move"),
    playEat: () => play("eat"),
    playBlow: () => play("blow"),
    playWin: () => play("win"),
    playLose: () => play("lose"),
    playClick: () => play("click"),
    playBuzz: () => play("buzz"),
    setEnabled,
    setVolume,
    getVolume,
    isEnabled
  };
})();
