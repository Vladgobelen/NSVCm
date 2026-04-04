import VolumeBoostManager from './VolumeBoostManager.js';
import UIManager from './UIManager.js';
import MembersManager from './MembersManager.js';

class MediaManager {
    static async connect(client, roomId, mediaData) {
        try {
            if (typeof mediasoupClient === 'undefined') {
                throw new Error('mediasoup-client not loaded');
            }
            client.device = new mediasoupClient.Device();
            await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
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
        this.setupTransportStateChangeHandler(client, client.sendTransport); // 🔥 НОВОЕ
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
        this.setupTransportStateChangeHandler(client, client.recvTransport); // 🔥 НОВОЕ
    }
}

static setupTransportStateChangeHandler(client, transport) {
    transport.on('connectionstatechange', (state) => {
        // Игнорируем закрытие, так как оно обрабатывается в disconnect/leaveRoom
        if (transport.closed) return;

        if (state === 'failed' || state === 'disconnected') {
            console.warn(`⚠️ [MEDIA] ICE-соединение транспорта ${transport.id} упало (state: ${state}). Запуск восстановления...`);
            
            // Запускаем переподключение только если оно ещё не идёт
            if (client.currentRoom && !client.isReconnecting && !client._isMediaReconnecting) {
                client._isMediaReconnecting = true;
                client.reconnectToRoom(client.currentRoom, 3, 2000, false, true)
                    .finally(() => { client._isMediaReconnecting = false; });
            }
        }
    });
}

    static setupTransportConnectHandler(client, transport) {
        let connectSent = false;
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            if (connectSent) {
                if (errback) errback(new Error('Connect already sent'));
                return;
            }
            connectSent = true;
            if (!client.socket?.connected) {
                if (errback) errback(new Error('Socket not connected'));
                return;
            }
            const responseTimeout = setTimeout(() => {
                if (errback) errback(new Error('Server response timeout'));
            }, 20000);
            
            client.socket.emit('transport-connect', {
                transportId: transport.id,
                dtlsParameters,
                clientId: client.clientID
            }, (response) => {
                clearTimeout(responseTimeout);
                if (response?.success) {
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
                }, 15000);
                
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
            console.error('Failed to init microphone:', error);
            client.isMicActive = false;
            client.isMicPaused = false;
            if (client.stream) {
                client.stream.getTracks().forEach(t => t.stop());
                client.stream = null;
            }
        }
    }

    static async toggleMicrophone(client) {
        if (!client.currentRoom || !client.isMicActive) return false;
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
        if (client.sendTransport.closed || client.sendTransport.connectionState === 'failed') {
            return false;
        }
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

        const audioElement = new Audio();
        audioElement.id = `audio-${consumerParams.producerId}`;
        audioElement.autoplay = true;
        audioElement.muted = false;
        audioElement.style.display = 'none';
        audioElement.srcObject = new MediaStream([consumer.track]);

        audioElement.play().catch(() => {});

        consumer.on('trackended', () => { consumer.trackEnded = true; });
        consumer.on('transportclose', () => { consumer.transportClosed = true; });

        return { consumer, audioElement };
    }

    static disconnect(client) {
        this.stopMicrophone(client, true);
        if (client.recvTransport) {
            try { if (!client.recvTransport.closed) client.recvTransport.close(); } catch {}
            client.recvTransport = null;
        }
        if (client.consumerState) {
            client.consumerState.forEach((state) => {
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
