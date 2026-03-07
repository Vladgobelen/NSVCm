class VolumeBoostManager {
    static audioCtx = null;
    static boosts = new Map();
    static isResuming = false;

    static async _ensureAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.audioCtx.state === 'suspended' && !this.isResuming) {
            this.isResuming = true;
            try {
                await this.audioCtx.resume();
            } catch (err) {
                console.error('VolumeBoostManager: Failed to resume AudioContext:', err);
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
                console.error('VolumeBoostManager: resume() failed', e);
            }
        }
    }

    static _setupNodes(ctx, src, initialGain) {
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

        return { gainNode, compressor, dest };
    }

    static async attachToAudioElement(audioElement, userId, initialGain = 1.0) {
        if (!audioElement) return;

        if (audioElement.readyState === 0) {
            await new Promise(resolve => {
                audioElement.addEventListener('loadedmetadata', resolve, { once: true });
                audioElement.addEventListener('canplay', resolve, { once: true });
                setTimeout(resolve, 1000);
            });
        }

        const ctx = await this._ensureAudioContext();

        if (this.boosts.has(userId)) {
            this.detach(userId);
        }

        if (!audioElement.srcObject && !audioElement.src) {
            console.error('VolumeBoostManager: audioElement has no srcObject or src');
            return;
        }

        let src = null;
        let originalSrcObject = audioElement.srcObject;
        let createdFromStream = false;

        try {
            if (audioElement.srcObject instanceof MediaStream) {
                const stream = audioElement.srcObject;
                if (!stream.getAudioTracks().length) {
                    console.error('VolumeBoostManager: MediaStream has no audio tracks');
                    return;
                }
                src = ctx.createMediaStreamSource(stream);
                createdFromStream = true;
            } else {
                src = ctx.createMediaElementSource(audioElement);
            }
        } catch (e) {
            console.error('VolumeBoostManager: create source failed', e);
            return;
        }

        const { gainNode, compressor, dest } = this._setupNodes(ctx, src, initialGain);

        try {
            const wasPlaying = !audioElement.paused && !audioElement.ended;

            audioElement.pause();
            audioElement.srcObject = dest.stream;

            if (wasPlaying) {
                await new Promise(resolve => setTimeout(resolve, 100));
                await audioElement.play();
            }
        } catch (e) {
            console.error('VolumeBoostManager: error while reassigning srcObject', e);
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
    }

    static async attachToMediaStream(mediaStream, userId, initialGain = 1.0) {
        if (!(mediaStream instanceof MediaStream)) return null;
        const ctx = await this._ensureAudioContext();

        if (this.boosts.has(userId)) this.detach(userId);

        const src = ctx.createMediaStreamSource(mediaStream);
        const { gainNode, compressor, dest } = this._setupNodes(ctx, src, initialGain);

        this.boosts.set(userId, {
            source: src,
            gainNode,
            compressor,
            dest,
            audioElement: null,
            originalSrcObject: null,
            createdFromStream: true
        });

        return dest.stream;
    }

    static setGain(userId, value) {
        const entry = this.boosts.get(userId);
        if (!entry) return;

        const v = Number(value);
        if (isNaN(v) || !isFinite(v)) return;

        const clamped = Math.max(0, Math.min(10, v));
        if (this.audioCtx) {
            entry.gainNode.gain.setValueAtTime(clamped, this.audioCtx.currentTime);
        }
    }

    static detach(userId) {
        const entry = this.boosts.get(userId);
        if (!entry) return;

        try {
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

            if (entry.audioElement) {
                try {
                    const ae = entry.audioElement;
                    const wasPlaying = !ae.paused && !ae.ended;
                    ae.pause();
                    ae.srcObject = entry.originalSrcObject || null;
                    if (wasPlaying) {
                        const p = ae.play();
                        if (p && p.catch) p.catch(() => {});
                    }
                } catch (e) {
                    console.error('VolumeBoostManager: restore audioElement failed', e);
                }
            }
        } catch (e) {
            console.error('VolumeBoostManager: detach error', e);
        } finally {
            this.boosts.delete(userId);
        }
    }

    static detachAll() {
        for (const userId of Array.from(this.boosts.keys())) {
            this.detach(userId);
        }
    }

    static getGain(userId) {
        const entry = this.boosts.get(userId);
        if (!entry) return null;
        return entry.gainNode.gain.value;
    }

    static isChromeOrEdge() {
        return /Chrome|Edg/.test(navigator.userAgent);
    }
}

export default VolumeBoostManager;
