// VolumeBoostManager.js
// Модуль для усиления звука конкретного говорящего (gain/усиление) в голосовом чате.
// Формат: ES Module. Помещается в renderer/voice/modules/
// Как использовать (пример):
// import VolumeBoostManager from './modules/VolumeBoostManager.js';
// VolumeBoostManager.resume(); // резюмирует AudioContext при первом взаимодействии (рекомендуется вызвать по user gesture)
// // если у вас есть HTMLAudioElement, связанный с пользователем:
// VolumeBoostManager.attachToAudioElement(audioElement, userId); // audioElement может иметь srcObject = MediaStream или src = URL
// VolumeBoostManager.setGain(userId, 1.8); // усилить в 1.8 раза
// VolumeBoostManager.detach(userId); // вернуть всё назад и освободить ресурсы
//
// Примечания:
// - Модуль использует WebAudio API: AudioContext, GainNode, MediaStreamDestination и MediaStreamSource.
// - Если audioElement уже воспроизводил поток, модуль перенаправит воспроизведение через internal MediaStreamDestination.
// - Не изменяет глобальные настройки приложения (при удалении/detach восстанавливает поведение аудио-элемента в меру возможности).

class VolumeBoostManager {
    static audioCtx = null;
    // userId => { source, gainNode, dest, audioElement, originalSrcObject }
    static boosts = new Map();
    static isResuming = false;

    static async _ensureAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🎵 VolumeBoostManager: AudioContext created, state:', this.audioCtx.state);
        }
        
        // 🔴 УЛУЧШЕННАЯ ОБРАБОТКА ДЛЯ CHROME/EDGE
        if (this.audioCtx.state === 'suspended' && !this.isResuming) {
            this.isResuming = true;
            console.warn('🎵 VolumeBoostManager: AudioContext suspended, attempting to resume...');
            try {
                await this.audioCtx.resume();
                console.log('🎵 VolumeBoostManager: AudioContext resumed successfully');
            } catch (err) {
                console.error('🎵 VolumeBoostManager: Failed to resume AudioContext:', err);
            } finally {
                this.isResuming = false;
            }
        }
        
        return this.audioCtx;
    }

    // Resume context (call on user gesture if needed)
    static async resume() {
        const ctx = await this._ensureAudioContext();
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume();
                console.log('🎵 VolumeBoostManager: AudioContext resumed via resume()');
            } catch (e) {
                console.warn('🎵 VolumeBoostManager: resume() failed', e);
            }
        }
    }

    // Attach boost to HTMLAudioElement. audioElement can have .srcObject (MediaStream) or .src (URL)
    static async attachToAudioElement(audioElement, userId, initialGain = 1.0) {
        if (!audioElement) return;
        
        console.log('🎵 VolumeBoostManager: attachToAudioElement for user:', userId);
        console.log('🎵 VolumeBoostManager: audioElement state - paused:', audioElement.paused, 'ended:', audioElement.ended);
        console.log('🎵 Browser:', navigator.userAgent);
        
        // 🔴 ОЖИДАЕМ ГОТОВНОСТИ АУДИО ЭЛЕМЕНТА ДЛЯ CHROME
        if (audioElement.readyState === 0) {
            console.log('🎵 VolumeBoostManager: waiting for audio element to be ready...');
            await new Promise(resolve => {
                audioElement.addEventListener('loadedmetadata', resolve, { once: true });
                audioElement.addEventListener('canplay', resolve, { once: true });
                // Таймаут на случай если события не придут
                setTimeout(resolve, 1000);
            });
        }

        const ctx = await this._ensureAudioContext();

        // If there is already a boost for this user, detach first
        if (this.boosts.has(userId)) {
            console.log('🎵 VolumeBoostManager: detaching existing boost for user:', userId);
            this.detach(userId);
        }

        let src = null;
        let createdFromStream = false;
        let originalSrcObject = audioElement.srcObject;

        // 🔴 ДОБАВЛЯЕМ ПРОВЕРКУ ДЛЯ CHROME
        if (!audioElement.srcObject && !audioElement.src) {
            console.warn('🎵 VolumeBoostManager: audioElement has no srcObject or src, skipping');
            return;
        }

        try {
            if (audioElement.srcObject instanceof MediaStream) {
                console.log('🎵 VolumeBoostManager: creating MediaStreamSource');
                
                // 🔴 ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА ДЛЯ CHROME
                const stream = audioElement.srcObject;
                if (!stream.getAudioTracks().length) {
                    console.warn('🎵 VolumeBoostManager: MediaStream has no audio tracks');
                    return;
                }
                
                src = ctx.createMediaStreamSource(stream);
                createdFromStream = true;
            } else {
                console.log('🎵 VolumeBoostManager: creating MediaElementSource');
                src = ctx.createMediaElementSource(audioElement);
            }
        } catch (e) {
            console.warn('🎵 VolumeBoostManager: create source failed', e);
            return;
        }

        const gainNode = ctx.createGain();
        gainNode.gain.value = Number(initialGain) || 1.0;
        console.log('🎵 VolumeBoostManager: gain node created with value:', gainNode.gain.value);
        
        // Optional: add a soft limiter (dynamics compressor) to avoid clipping when applying large gain
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -3; // dB
        compressor.knee.value = 6;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.2;

        // Create destination stream and route the processed audio to it
        const dest = ctx.createMediaStreamDestination();
        // Source -> gain -> compressor -> dest
        src.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(dest);

        // Preserve element's playback state; set new srcObject to processed stream
        try {
            // Pause, change source, then play if it was playing
            const wasPlaying = !audioElement.paused && !audioElement.ended;
            console.log('🎵 VolumeBoostManager: wasPlaying:', wasPlaying);
            
            audioElement.pause();
            audioElement.srcObject = dest.stream;
            
            // 🔴 УЛУЧШЕННАЯ ОБРАБОТКА ВОСПРОИЗВЕДЕНИЯ ДЛЯ CHROME
            if (wasPlaying) {
                console.log('🎵 VolumeBoostManager: attempting to play audio element');
                try {
                    // Ждем немного для стабилизации потока в Chrome
                    await new Promise(resolve => setTimeout(resolve, 100));
                    await audioElement.play();
                    console.log('🎵 VolumeBoostManager: audio element played successfully');
                } catch (playError) {
                    console.warn('🎵 VolumeBoostManager: play failed, may need user interaction:', playError);
                    // В Chrome может потребоваться пользовательское взаимодействие
                }
            }
        } catch (e) {
            console.warn('🎵 VolumeBoostManager: error while reassigning srcObject', e);
        }

        this.boosts.set(userId, {
            source: src,
            gainNode,
            compressor,
            dest,
            audioElement,
            originalSrcObject,
            createdFromStream
        });

        console.log('🎵 VolumeBoostManager: attached boost for', userId, 'gain=', gainNode.gain.value);
    }

    // Attach boost directly to a MediaStream (no audio element handling) and return boosted MediaStream
    static async attachToMediaStream(mediaStream, userId, initialGain = 1.0) {
        if (!(mediaStream instanceof MediaStream)) return null;
        const ctx = await this._ensureAudioContext();
        if (this.boosts.has(userId)) this.detach(userId);

        const src = ctx.createMediaStreamSource(mediaStream);
        const gainNode = ctx.createGain();
        gainNode.gain.value = Number(initialGain) || 1.0;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -3;
        compressor.knee.value = 6;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.2;

        const dest = ctx.createMediaStreamDestination();
        src.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(dest);

        this.boosts.set(userId, {
            source: src,
            gainNode,
            compressor,
            dest,
            audioElement: null,
            originalSrcObject: null,
            createdFromStream: true
        });

        console.log('🎵 VolumeBoostManager: attached to MediaStream for', userId, 'gain=', gainNode.gain.value);
        return dest.stream;
    }

    // Set gain for userId (1.0 = original, >1 = boost, <1 = attenuation)
    static setGain(userId, value) {
        const entry = this.boosts.get(userId);
        if (!entry) {
            console.warn('🎵 VolumeBoostManager: setGain no entry for', userId);
            return;
        }
        const v = Number(value);
        if (isNaN(v) || !isFinite(v)) return;
        // clamp to [0, 10] to avoid absurd values
        const clamped = Math.max(0, Math.min(10, v));
        if (this.audioCtx) {
            entry.gainNode.gain.setValueAtTime(clamped, this.audioCtx.currentTime);
        }
        console.log('🎵 VolumeBoostManager: setGain', userId, clamped);
    }

    // Detach and restore audioElement to original srcObject if possible
    static detach(userId) {
        const entry = this.boosts.get(userId);
        if (!entry) return;
        try {
            // disconnect nodes
            if (entry.source) {
                try { entry.source.disconnect(); } catch (e) {}
            }
            if (entry.gainNode) {
                try { entry.gainNode.disconnect(); } catch (e) {}
            }
            if (entry.compressor) {
                try { entry.compressor.disconnect(); } catch (e) {}
            }
            if (entry.dest) {
                try { entry.dest.disconnect(); } catch (e) {}
            }
            // restore audio element original stream if we modified it
            if (entry.audioElement) {
                try {
                    // Pause and restore original stream
                    const ae = entry.audioElement;
                    const wasPlaying = !ae.paused && !ae.ended;
                    ae.pause();
                    ae.srcObject = entry.originalSrcObject || null;
                    if (wasPlaying) {
                        const p = ae.play();
                        if (p && p.catch) p.catch(()=>{});
                    }
                } catch (e) {
                    console.warn('🎵 VolumeBoostManager: restore audioElement failed', e);
                }
            }
        } catch (e) {
            console.warn('🎵 VolumeBoostManager: detach error', e);
        } finally {
            this.boosts.delete(userId);
            console.log('🎵 VolumeBoostManager: detached', userId);
        }
    }

    // Detach all entries and close AudioContext (optional)
    static detachAll() {
        for (const userId of Array.from(this.boosts.keys())) {
            this.detach(userId);
        }
    }

    // Get current gain value for userId
    static getGain(userId) {
        const entry = this.boosts.get(userId);
        if (!entry) return null;
        return entry.gainNode.gain.value;
    }

    // 🔴 ДОБАВИТЬ МЕТОД ДЛЯ ПРОВЕРКИ БРАУЗЕРА
    static isChromeOrEdge() {
        return /Chrome|Edg/.test(navigator.userAgent);
    }
}

export default VolumeBoostManager;
