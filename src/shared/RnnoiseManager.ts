class RnnoiseManager {
    static audioContext: AudioContext | null = null;
    static noiseProcessor: ScriptProcessorNode | null = null;
    static sourceNode: MediaStreamAudioSourceNode | null = null;
    static isEnabled: boolean = false;
    static _streamToRestore: MediaStream | null = null;
    static _rnnoiseModule: any = null;
    static _initPromise: Promise<any> | null = null;
    static _destination: MediaStreamAudioDestinationNode | null = null;

    static LOCAL_SCRIPT_PATH: string = '/rnnoise.js';

    static async _loadRnnoiseModule(): Promise<any> {
        if (this._rnnoiseModule) {
            return this._rnnoiseModule;
        }

        if (this._initPromise) {
            return this._initPromise;
        }

        this._initPromise = new Promise((resolve, reject) => {
            import(this.LOCAL_SCRIPT_PATH)
                .then(async (module) => {
                    const rnnoiseModule = await module.default();
                    this._rnnoiseModule = rnnoiseModule;
                    resolve(rnnoiseModule);
                })
                .catch((error) => {
                    console.error('[RnnoiseManager] Failed to load module:', error);
                    reject(error);
                });
        });

        return this._initPromise;
    }

    static async _ensureAudioContext(): Promise<AudioContext> {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        return this.audioContext;
    }

    static async enable(originalStream: MediaStream, client: any = null): Promise<MediaStream> {
        if (client && client.audioRNNoise === false) {
            return originalStream;
        }

        if (this.isEnabled) {
            this.disable();
        }

        try {
            const rnnoise = await this._loadRnnoiseModule();
            const ctx = await this._ensureAudioContext();

            const tracks = originalStream.getAudioTracks();
            if (tracks.length === 0) {
                throw new Error('Original stream has no audio tracks');
            }
            if (tracks[0].readyState === 'ended') {
                throw new Error('Original stream track is ended');
            }

            this.sourceNode = ctx.createMediaStreamSource(originalStream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);

            rnnoise._rnnoise_init();
            const noiseState = rnnoise._rnnoise_create();

            processor.onaudioprocess = (event: AudioProcessingEvent) => {
                const input = event.inputBuffer.getChannelData(0);
                const output = event.outputBuffer.getChannelData(0);
                output.set(input);
                for (let i = 0; i + 480 <= input.length; i += 480) {
                    const frame = input.slice(i, i + 480);
                    rnnoise._rnnoise_process_frame(noiseState, frame);
                    output.set(frame, i);
                }
            };

            (processor as any)._noiseState = noiseState;
            (processor as any)._rnnoise = rnnoise;

            this._destination = ctx.createMediaStreamDestination();

            this.sourceNode.connect(processor);
            processor.connect(this._destination);

            const destStream = this._destination.stream;
            const destTrack = destStream.getAudioTracks()[0];

            let processedStream: MediaStream;
            if (destTrack && destTrack.label === '' && Object.keys(destTrack.getSettings()).length === 0) {
                const oscillator = ctx.createOscillator();
                const dummyDest = ctx.createMediaStreamDestination();
                oscillator.connect(dummyDest);
                oscillator.start(0);
                oscillator.stop(0.001);
                await new Promise((r) => setTimeout(r, 100));
                processedStream = this._destination.stream;
            } else {
                processedStream = destStream;
            }

            const finalTrack = processedStream.getAudioTracks()[0];
            if (finalTrack) {
                finalTrack.enabled = true;
            }

            this.noiseProcessor = processor;
            this.isEnabled = true;
            this._streamToRestore = originalStream;

            return processedStream;
        } catch (error) {
            console.error('[RnnoiseManager] Enable failed:', error);
            this.disable();
            throw error;
        }
    }

    static disable(): MediaStream | null {
        if (!this.isEnabled) return this._streamToRestore;

        if (this.noiseProcessor) {
            if ((this.noiseProcessor as any)._noiseState && (this.noiseProcessor as any)._rnnoise) {
                (this.noiseProcessor as any)._rnnoise._rnnoise_destroy((this.noiseProcessor as any)._noiseState);
            }
            try {
                this.noiseProcessor.disconnect();
            } catch (e) {}
            this.noiseProcessor = null;
        }

        if (this.sourceNode) {
            try {
                this.sourceNode.disconnect();
            } catch (e) {}
            this.sourceNode = null;
        }

        this._destination = null;
        this.isEnabled = false;
        return this._streamToRestore;
    }

    static async isAvailable(): Promise<boolean> {
        try {
            await this._loadRnnoiseModule();
            return true;
        } catch (e) {
            return false;
        }
    }
}

export default RnnoiseManager;
