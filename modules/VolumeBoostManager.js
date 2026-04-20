class VolumeBoostManager {
  static audioCtx = null;
  static isResuming = false;
  static gainNodes = new Map();
  static sourceNodes = new Map();
  static attachedElements = new Map();

  static async _ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended' && !this.isResuming) {
      this.isResuming = true;
      try {
        await this.audioCtx.resume();
      } catch (err) {
        console.error('VolumeBoost: Failed to resume AudioContext', err);
      } finally {
        this.isResuming = false;
      }
    }
    return this.audioCtx;
  }

  static async resume() {
    const ctx = await this._ensureAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        console.error('VolumeBoost: Failed to resume', e);
      }
    }
  }

static async attachConsumer(consumer, userId, initialGain = 1.0) {
  if (!consumer || !consumer.track || !userId) return;

  const track = consumer.track;
  if (track.readyState !== 'live') return;

  await this._ensureAudioContext();
  const ctx = this.audioCtx;

  const client = window.voiceClient;
  
  for (const [pid, state] of client.consumerState.entries()) {
    if (state.consumer === consumer) {
      if (state.audioElement) {
        //state.audioElement.srcObject = null;
        state.audioElement.volume = 0;
        state.audioElement.muted = true;
        state.audioElement.pause();
      }
      break;
    }
  }

  track.enabled = true;

  const stream = new MediaStream([track]);
  const source = ctx.createMediaStreamSource(stream);

  let gainNode = this.gainNodes.get(userId);
  if (!gainNode) {
    gainNode = ctx.createGain();
    gainNode.gain.value = initialGain;
    gainNode.connect(ctx.destination);
    this.gainNodes.set(userId, gainNode);
  } else {
    gainNode.gain.value = initialGain;
  }

  const oldSource = this.sourceNodes.get(userId);
  if (oldSource) {
    try { oldSource.disconnect(); } catch(e) {}
  }

  source.connect(gainNode);
  this.sourceNodes.set(userId, source);
}

static async attachToAudioElement(audioElement, userId, initialGain = 1.0) {
  if (!audioElement || !userId) return;

  this.attachedElements.set(userId, audioElement);

  if (this.gainNodes.has(userId)) {
    this.setGain(userId, initialGain);
    return;
  }

  await this._ensureAudioContext();

  try {
    const stream = audioElement.srcObject;
    if (!stream) {
      throw new Error('No srcObject on audio element');
    }

    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      throw new Error('No audio tracks in stream');
    }

    //audioElement.srcObject = null;
    audioElement.volume = 0;
    audioElement.muted = true;

    const newStream = new MediaStream([tracks[0]]);
    const source = this.audioCtx.createMediaStreamSource(newStream);
    const gainNode = this.audioCtx.createGain();
    gainNode.gain.value = initialGain;

    source.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    this.sourceNodes.set(userId, source);
    this.gainNodes.set(userId, gainNode);
  } catch (e) {
    console.error('VolumeBoost: Failed to attach', userId, e);
    this.gainNodes.set(userId, null);
  }
}

  static setGain(userId, value) {
    const gainNode = this.gainNodes.get(userId);
    const v = Number(value);

    if (gainNode && !isNaN(v) && isFinite(v)) {
      gainNode.gain.value = Math.max(0, Math.min(4.0, v));
    } else {
      const audio = this.attachedElements.get(userId);
      if (audio) {
        audio.volume = Math.max(0, Math.min(1.0, v));
      }
    }
  }

  static getGain(userId) {
    const gainNode = this.gainNodes.get(userId);
    if (gainNode) {
      return gainNode.gain.value;
    }
    const audio = this.attachedElements.get(userId);
    return audio ? audio.volume : null;
  }

  static detach(userId) {
    const source = this.sourceNodes.get(userId);
    const gain = this.gainNodes.get(userId);

    try { source?.disconnect(); } catch (e) {}
    try { gain?.disconnect(); } catch (e) {}

    this.sourceNodes.delete(userId);
    this.gainNodes.delete(userId);
    this.attachedElements.delete(userId);
  }

  static detachAll() {
    const userIds = Array.from(this.gainNodes.keys());
    userIds.forEach((userId) => this.detach(userId));
  }

  static async unlockAndroidAudio() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) return false;
    try {
      await this.resume();
      const audio = new Audio();
      audio.muted = true;
      audio.playsInline = true;
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAA=';
      await audio.play();
      document.querySelectorAll('audio').forEach((el) => {
        if (el.paused && !el.muted) {
          el.play().catch(() => {});
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }
}

export default VolumeBoostManager;
