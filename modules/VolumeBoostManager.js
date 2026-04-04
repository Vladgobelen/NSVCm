class VolumeBoostManager {
  static audioCtx = null;
  static isResuming = false;
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
        // Ignored
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
        // Ignored
      }
    }
  }

  static async attachToAudioElement(audioElement, userId, initialGain = 1.0) {
    if (!audioElement || !userId) return;
    await this._ensureAudioContext();
    this.attachedElements.set(userId, audioElement);
    if (audioElement.readyState >= 2) {
      this._applyVolume(audioElement, initialGain);
    } else {
      audioElement.addEventListener('canplay', () => this._applyVolume(audioElement, initialGain), { once: true });
    }
  }

  static _applyVolume(audioElement, gainValue) {
    if (!audioElement) return;
    const v = Number(gainValue);
    if (isNaN(v) || !isFinite(v)) return;
    audioElement.volume = Math.max(0, Math.min(1, v));
  }

  static setGain(userId, value) {
    const audioElement = this.attachedElements.get(userId);
    if (audioElement) {
      this._applyVolume(audioElement, value);
    }
  }

  static detach(userId) {
    this.attachedElements.delete(userId);
  }

  static getGain(userId) {
    const audioElement = this.attachedElements.get(userId);
    return audioElement ? audioElement.volume : null;
  }

  static detachAll() {
    this.attachedElements.clear();
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
      document.querySelectorAll('audio').forEach(el => {
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
