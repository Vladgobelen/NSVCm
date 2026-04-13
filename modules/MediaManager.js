import VolumeBoostManager from './VolumeBoostManager.js';
import UIManager from './UIManager.js';

const TRANSPORT_CONNECT_TIMEOUT = 20000;
const PRODUCE_TIMEOUT = 15000;
const CONSUME_TIMEOUT = 10000;

class MediaManager {
    static async connect(client, roomId, mediaData) {
        try {
            if (typeof mediasoupClient === 'undefined') {
                throw new Error('mediasoup-client not loaded');
            }

            if (!client.device || client.device.loaded === false) {
                client.device = new mediasoupClient.Device();
                await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
            }

            await this.createTransports(client, mediaData);
            await this.initMicrophone(client);

            client.isConnected = true;
            client.isMicActive = client.audioProducer !== null;
            client.isMicPaused = true;
            client.consumerState = new Map();
            
            if (client.socket) {
                client.socket.emit('request-mic-states', { roomId });
            }
        } catch (error) {
            console.error('Media connection failed:', error.message);
            client.device = null;
            client.sendTransport = null;
            client.recvTransport = null;
            client.audioProducer = null;
            throw new Error(`Media connection failed: ${error.message}`);
        }
    }

    static async createTransports(client, mediaData) {
        if (!client.sendTransport) {
            const sendOptions = {
                id: mediaData.sendTransport.id,
                iceParameters: mediaData.sendTransport.iceParameters,
                iceCandidates: mediaData.sendTransport.iceCandidates,
                dtlsParameters: mediaData.sendTransport.dtlsParameters,
                iceServers: mediaData.iceServers || []
            };
            client.sendTransport = client.device.createSendTransport(sendOptions);
            this.setupTransportConnectHandler(client, client.sendTransport);
            this.setupTransportStateChangeHandler(client, client.sendTransport);
            this.setupSendTransportHandlers(client);
        }
        if (!client.recvTransport) {
            const recvOptions = {
                id: mediaData.recvTransport.id,
                iceParameters: mediaData.recvTransport.iceParameters,
                iceCandidates: mediaData.recvTransport.iceCandidates,
                dtlsParameters: mediaData.recvTransport.dtlsParameters,
                iceServers: mediaData.iceServers || []
            };
            client.recvTransport = client.device.createRecvTransport(recvOptions);
            this.setupTransportConnectHandler(client, client.recvTransport);
            this.setupTransportStateChangeHandler(client, client.recvTransport);
        }
    }

    static setupTransportStateChangeHandler(client, transport) {
        transport.on('connectionstatechange', (state) => {
            if (transport.closed) return;
            
            const isRecvTransport = (transport === client.recvTransport);
            const transportType = isRecvTransport ? 'recv' : 'send';
            
            if (state === 'failed' || state === 'disconnected') {
                if (client.currentRoom && !client.isReconnecting && !client._isMediaReconnecting) {
                    if (client._scheduleIceRestart) {
                        client._scheduleIceRestart(transport, transportType);
                    } else {
                        client._isMediaReconnecting = true;
                        client.reconnectToRoom(client.currentRoom, 3, 2000, false, true)
                            .finally(() => { client._isMediaReconnecting = false; });
                    }
                }
            } else if (state === 'connected') {
                if (isRecvTransport && client._transportReadyForConsume !== undefined) {
                    client._transportReadyForConsume = true;
                    if (client._processPendingConsumeQueue) {
                        client._processPendingConsumeQueue();
                    }
                }
                if (client.iceRestartState) {
                    client.iceRestartState.delete(transport.id);
                }
            }
        });
    }

    static setupTransportConnectHandler(client, transport) {
        let connectSent = false;
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            if (connectSent || transport.__connected) {
                if (errback) errback(new Error('Connect already sent or completed'));
                return;
            }
            connectSent = true;
            if (!client.socket?.connected) {
                if (errback) errback(new Error('Socket not connected'));
                return;
            }

            const responseTimeout = setTimeout(() => {
                if (errback) errback(new Error('Server response timeout'));
            }, TRANSPORT_CONNECT_TIMEOUT);

            client.socket.emit('transport-connect', {
                transportId: transport.id,
                dtlsParameters,
                clientId: client.clientID
            }, (response) => {
                clearTimeout(responseTimeout);
                if (response?.success) {
                    transport.__connected = true;
                    if (callback) callback();
                } else {
                    const errorMsg = response?.error || 'Server rejected handshake';
                    if (errback) errback(new Error(errorMsg));
                }
            });
        });
    }

    static setupSendTransportHandlers(client) {
        client.sendTransport.on('produce', async (parameters, callback, errback) => {
            try {
                const responseTimeout = setTimeout(() => {
                    if (errback) errback(new Error('Produce response timeout'));
                }, PRODUCE_TIMEOUT);

                client.socket.emit('produce', {
                    transportId: client.sendTransport.id,
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    clientId: client.clientID,
                    roomId: client.currentRoom
                }, (response) => {
                    clearTimeout(responseTimeout);
                    if (response?.success) {
                        if (typeof callback === 'function') callback({ id: response.producerId });
                    } else {
                        const errorMsg = response?.error || 'Server rejected produce';
                        if (errback) errback(new Error(errorMsg));
                    }
                });
            } catch (error) {
                if (typeof errback === 'function') errback(error);
            }
        });
    }

    static async initMicrophone(client) {
        try {
            if (!client.sendTransport) throw new Error('Send transport not initialized');
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    latency: 0.1
                }
            };

            client.stream = await navigator.mediaDevices.getUserMedia(constraints);
            const track = client.stream.getAudioTracks()[0];
            track.enabled = false;

            client.audioProducer = await client.sendTransport.produce({
                track,
                encodings: [{ maxBitrate: 24000, dtx: true }],
                appData: { clientID: client.clientID, roomId: client.currentRoom }
            });

            client.audioProducer.on('transportclose', () => {
                client.audioProducer = null;
                client.isMicActive = false;
                client.isMicPaused = false;
                client.updateMicButtonState?.();
            });

            client.audioProducer.on('trackended', () => {
                client.audioProducer = null;
                client.isMicActive = false;
                client.isMicPaused = false;
                client.updateMicButtonState?.();
            });

            await client.audioProducer.pause();
            client.isMicActive = true;
            client.isMicPaused = true;

            if (client.socket && client.audioProducer) {
                client.socket.emit('new-producer-notification', {
                    roomId: client.currentRoom,
                    producerId: client.audioProducer.id,
                    clientID: client.clientID,
                    userId: client.userId,
                    kind: 'audio'
                });
            }
        } catch (error) {
            console.error('Failed to init microphone:', error.message);
            client.isMicActive = false;
            client.isMicPaused = false;
            client.audioProducer = null;
            if (client.stream) {
                client.stream.getTracks().forEach(t => t.stop());
                client.stream = null;
            }
            UIManager.showError('Микрофон: ' + error.message);
        }
    }

    static async toggleMicrophone(client) {
        if (!client.currentRoom || !client.isMicActive || !client.audioProducer) return false;
        return client.isMicPaused ? await this.resumeMicrophone(client) : await this.pauseMicrophone(client);
    }

    static async pauseMicrophone(client) {
        if (!client.audioProducer || client.audioProducer.closed) return false;
        await client.audioProducer.pause();
        if (client.audioProducer.track) client.audioProducer.track.enabled = false;
        client.isMicPaused = true;
        client.socket?.emit('mic-indicator-state', { roomId: client.currentRoom, isActive: false });
        return true;
    }

    static async resumeMicrophone(client) {
        if (!client.audioProducer || client.audioProducer.closed) return false;
        await client.audioProducer.resume();
        if (client.audioProducer.track) client.audioProducer.track.enabled = true;
        client.isMicPaused = false;
        client.socket?.emit('mic-indicator-state', { roomId: client.currentRoom, isActive: true });
        return true;
    }

    static async stopMicrophone(client, closeTransport = true) {
        if (client.audioProducer) {
            try { client.audioProducer.close(); } catch {}
            client.audioProducer = null;
        }
        if (client.stream) {
            client.stream.getTracks().forEach(t => t.stop());
            client.stream = null;
        }
        if (closeTransport && client.sendTransport) {
            try { if (!client.sendTransport.closed) client.sendTransport.close(); } catch {}
            client.sendTransport = null;
        }
        client.isMicActive = false;
        client.isMicPaused = false;
    }

    static async createConsumer(client, consumerParams) {
        if (!client.recvTransport || client.recvTransport.closed || client.recvTransport.connectionState === 'failed') {
            throw new Error('Recv transport is missing, closed, or failed');
        }
        if (client.audioProducer?.id === consumerParams.producerId || consumerParams.clientID === client.clientID) {
            throw new Error('Cannot consume own audio');
        }

        const consumer = await client.recvTransport.consume({
            id: consumerParams.id,
            producerId: consumerParams.producerId,
            kind: consumerParams.kind,
            rtpParameters: consumerParams.rtpParameters
        });

        consumer.on('trackended', () => {
            if (client._scheduleConsumerRetry) {
                client._scheduleConsumerRetry(
                    consumerParams.producerId,
                    { producerId: consumerParams.producerId, kind: consumerParams.kind },
                    'track_ended'
                );
            }
        });

        consumer.on('transportclose', () => {
            if (client._scheduleConsumerRetry) {
                client._scheduleConsumerRetry(
                    consumerParams.producerId,
                    { producerId: consumerParams.producerId, kind: consumerParams.kind },
                    'transport_closed'
                );
            }
        });

        consumer.on('producerclose', () => {
            if (client._resetConsumerRecoveryState) {
                client._resetConsumerRecoveryState(consumerParams.producerId);
            }
        });

        const audioElement = document.createElement('audio');
        audioElement.id = `audio-${consumerParams.producerId}`;
        audioElement.autoplay = true;
        audioElement.playsInline = true;
        audioElement.muted = false;
        audioElement.style.cssText = 'position:absolute; width:0; height:0; overflow:hidden; z-index:-1;';
        document.body.appendChild(audioElement);
        audioElement.srcObject = new MediaStream([consumer.track]);

        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                VolumeBoostManager.resume().catch(() => {});
                const retryPlay = () => audioElement.play().catch(() => {});
                document.addEventListener('click', retryPlay, { once: true });
                document.addEventListener('touchstart', retryPlay, { once: true });
            });
        }

        return { consumer, audioElement };
    }

    static async recoverConsumer(client, producerId, producerData) {
        if (!client.recvTransport || client.recvTransport.closed) {
            return false;
        }
        if (client.consumedProducerIdsRef?.has(producerId)) {
            return true;
        }
        try {
            return new Promise((resolve) => {
                if (!client.socket?.connected) {
                    resolve(false);
                    return;
                }
                client.socket.emit('consume', {
                    producerId,
                    rtpCapabilities: client.device.rtpCapabilities,
                    transportId: client.recvTransport.id,
                    clientId: client.clientID
                }, async (response) => {
                    if (response?.success && response.consumerParameters) {
                        try {
                            const { consumer, audioElement } = await this.createConsumer(client, response.consumerParameters);
                            if (client.consumerState) {
                                client.consumerState.set(producerId, {
                                    status: 'active',
                                    consumer,
                                    audioElement,
                                    lastError: null
                                });
                            }
                            if (client.consumedProducerIdsRef) {
                                client.consumedProducerIdsRef.add(producerId);
                            }
                            if (client._resetConsumerRecoveryState) {
                                client._resetConsumerRecoveryState(producerId);
                            }
                            resolve(true);
                        } catch (error) {
                            resolve(false);
                        }
                    } else {
                        resolve(false);
                    }
                });
            });
        } catch (error) {
            return false;
        }
    }

    static disconnect(client) {
        this.stopMicrophone(client, true);
        if (client.recvTransport) {
            try { if (!client.recvTransport.closed) client.recvTransport.close(); } catch {}
            client.recvTransport = null;
        }
        if (client.consumerState) {
            client.consumerState.forEach((state) => {
                if (state?.audioElement && state.audioElement.parentNode) {
                    state.audioElement.remove();
                }
                if (state?.consumer && !state.consumer.closed) {
                    try { state.consumer.close(); } catch {}
                }
            });
            client.consumerState.clear();
        }
        if (window.audioElements) {
            window.audioElements.forEach(audio => {
                try {
                    audio.pause();
                    audio.srcObject = null;
                    audio.remove();
                } catch {}
            });
            window.audioElements.clear();
        }
        client.device = null;
        client.isConnected = false;
        client.isMicActive = false;
        client.isMicPaused = false;
    }
}

export default MediaManager;
