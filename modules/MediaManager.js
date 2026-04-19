// modules/MediaManager.js - финальная версия с защитой

import VolumeBoostManager from './VolumeBoostManager.js';
import UIManager from './UIManager.js';

const TRANSPORT_CONNECT_TIMEOUT = 20000;
const PRODUCE_TIMEOUT = 15000;
const CONSUME_TIMEOUT = 10000;

class MediaManager {
    
    static async getMediasoupClient() {
        const msClient = window.mediasoupClient || 
                        (typeof globalThis !== 'undefined' && globalThis.mediasoupClient) ||
                        (typeof global !== 'undefined' && global.mediasoupClient);
        
        if (msClient) return msClient;
        
        console.log('⏳ Waiting for mediasoup-client to load...');
        return new Promise((resolve, reject) => {
            const maxAttempts = 50;
            let attempts = 0;
            
            const checkInterval = setInterval(() => {
                const client = window.mediasoupClient || 
                              (typeof globalThis !== 'undefined' && globalThis.mediasoupClient) ||
                              (typeof global !== 'undefined' && global.mediasoupClient);
                
                if (client) {
                    clearInterval(checkInterval);
                    console.log('✅ mediasoup-client loaded after', attempts * 100, 'ms');
                    resolve(client);
                } else if (++attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    console.error('❌ mediasoup-client not loaded after 5 seconds');
                    reject(new Error('mediasoup-client not loaded'));
                }
            }, 100);
        });
    }


static async connect(client, roomId, mediaData) {
    try {
        const mediasoupClient = await this.getMediasoupClient();
        
        if (!mediasoupClient.Device) {
            throw new Error('mediasoupClient.Device is not available');
        }

        if (!client.device || client.device.loaded === false) {
            client.device = new mediasoupClient.Device();
            await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
        }

        await this.createTransports(client, mediaData);

        client.isConnected = true;
        client.isMicActive = false;
        client.isMicPaused = true;
        client.consumerState = new Map();
        
        // 🔥 Сбрасываем флаги инициализации
        client._micInitInProgress = false;
        client._micInitPromise = null;
        
        if (client.socket) {
            client.socket.emit('request-mic-states', { roomId });
        }
        
        // 🔥 НЕ вызываем _setupFirstInteractionListener!
        // Микрофон будет инициализирован при клике на кнопку
        
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
        let hasBeenConnected = false;
        const transportCreatedAt = Date.now();
        
        transport.on('connectionstatechange', (state) => {
            if (transport.closed) return;
            
            const isRecvTransport = (transport === client.recvTransport);
            const isSendTransport = (transport === client.sendTransport);
            const transportType = isRecvTransport ? 'recv' : 'send';
            
            console.log(`[Transport] ${transportType} state changed: ${state}`);
            
            if ((state === 'failed' || state === 'disconnected') && !hasBeenConnected) {
                console.log(`[Transport] ${transportType} transport ${state} before first connection, ignoring...`);
                return;
            }
            
            if (state === 'connected') {
                hasBeenConnected = true;
                
                if (isSendTransport) {
                    client._sendTransportRecreateAttempts = 0;
                    client._isSendTransportRecreating = false;
                    // 🔥 Уведомляем, что транспорт готов
                    client._sendTransportReady = true;
                }
                
                if (isRecvTransport && client._transportReadyForConsume !== undefined) {
                    client._transportReadyForConsume = true;
                    if (client._processPendingConsumeQueue) {
                        client._processPendingConsumeQueue();
                    }
                }
                
                if (client.iceRestartState) {
                    client.iceRestartState.delete(transport.id);
                }
                
                console.log(`[Transport] ${transportType} connected successfully`);
                return;
            }
            
            if (state === 'failed' || state === 'disconnected') {
                if (isSendTransport) {
                    console.warn(`[Transport] Send transport ${state}, attempting to recreate...`);
                    
                    const timeSinceCreation = Date.now() - transportCreatedAt;
                    if (timeSinceCreation < 15000) {
                        console.log(`[Transport] Send transport still in initialization phase, ignoring ${state}`);
                        return;
                    }
                    
                    if (client._scheduleIceRestart && !client._isSendTransportRecreating) {
                        client._scheduleIceRestart(transport, 'send');
                    }
                } else if (isRecvTransport) {
                    console.warn(`[Transport] Recv transport ${state}, attempting recovery...`);
                    
                    if (client._scheduleIceRestart) {
                        client._scheduleIceRestart(transport, 'recv');
                    } else if (client.currentRoom && !client.isReconnecting && !client._isMediaReconnecting) {
                        client._isMediaReconnecting = true;
                        client.reconnectToRoom(client.currentRoom)
                            .finally(() => { client._isMediaReconnecting = false; });
                    }
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
    // Предотвращаем параллельные вызовы
    if (client._micInitInProgress) {
        console.log('[MediaManager] Microphone initialization already in progress, waiting...');
        return client._micInitPromise;
    }
    
    client._micInitInProgress = true;
    client._micInitPromise = this._doInitMicrophone(client);
    
    try {
        const result = await client._micInitPromise;
        console.log('[MediaManager] initMicrophone completed, result:', result);
        return result;
    } finally {
        client._micInitInProgress = false;
        client._micInitPromise = null;
    }
}    

static async _doInitMicrophone(client) {
    try {
        if (!client.sendTransport) {
            throw new Error('Send transport not initialized');
        }
        
        // Ждём подключения send транспорта
        if (client.sendTransport.connectionState !== 'connected') {
            console.log('[MediaManager] Waiting for send transport to connect...');
            
            // Показываем уведомление и НЕ убираем его автоматически
            const notification = UIManager.showNotification('🔗 Устанавливаем защищённое соединение...', 'info', 0);
            
            try {
                // Ждём подключения до 30 секунд
                await this._waitForTransportReady(client.sendTransport, 'send', 3000);
                
                // Подключилось - обновляем уведомление
                if (notification) {
                    notification.textContent = '✅ Защищённое соединение установлено!';
                    notification.style.background = '#2ecc71';
                    
                    setTimeout(() => {
                        notification.classList.add('fade-out');
                        setTimeout(() => notification.remove(), 300);
                    }, 2000);
                }
                
            } catch (e) {
                console.warn('[MediaManager] Send transport connection delayed, proceeding anyway...');
                
                // Таймаут - показываем что продолжаем
                if (notification) {
                    notification.textContent = '🌐 Продолжаем подключение...';
                    notification.style.background = '#faa61a';
                    
                    setTimeout(() => {
                        notification.classList.add('fade-out');
                        setTimeout(() => notification.remove(), 300);
                    }, 2000);
                }
            }
        }
        
        // Проверяем, может продюсер уже создан
        if (client.audioProducer && !client.audioProducer.closed) {
            console.log('[MediaManager] Microphone already initialized');
            return true;
        }
        
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1
            }
        };

        // Очищаем старый стрим если есть
        if (client.stream) {
            client.stream.getTracks().forEach(t => t.stop());
            client.stream = null;
        }

        console.log('[MediaManager] Requesting user media...');
        client.stream = await navigator.mediaDevices.getUserMedia(constraints);
        const track = client.stream.getAudioTracks()[0];
        
        if (!track) {
            throw new Error('No audio track available');
        }
        
        console.log('[MediaManager] Audio track obtained:', track.label);
        
        // Включаем трек
        track.enabled = true;

        console.log('[MediaManager] Creating audio producer...');
        client.audioProducer = await client.sendTransport.produce({
            track,
            encodings: [{ maxBitrate: 24000, dtx: true }],
            appData: { clientID: client.clientID, roomId: client.currentRoom }
        });

        console.log('[MediaManager] Audio producer created:', client.audioProducer.id);

        // Проверяем что продюсер реально создался
        if (!client.audioProducer || client.audioProducer.closed) {
            throw new Error('Producer creation failed or closed immediately');
        }

        client.audioProducer.on('transportclose', () => {
            console.log('[MediaManager] Producer transport closed');
            client.audioProducer = null;
            client.isMicActive = false;
            client.isMicPaused = true;
            if (client.updateMicButtonState) {
                client.updateMicButtonState();
            }
        });

        client.audioProducer.on('trackended', () => {
            console.log('[MediaManager] Producer track ended');
            client.audioProducer = null;
            client.isMicActive = false;
            client.isMicPaused = true;
            if (client.updateMicButtonState) {
                client.updateMicButtonState();
            }
        });

        // Устанавливаем состояние
        client.isMicActive = true;
        client.isMicPaused = false;
        
        // Уведомляем сервер
        if (client.socket) {
            client.socket.emit('new-producer-notification', {
                roomId: client.currentRoom,
                producerId: client.audioProducer.id,
                clientID: client.clientID,
                userId: client.userId,
                kind: 'audio'
            });
            
            client.socket.emit('mic-indicator-state', { 
                roomId: client.currentRoom, 
                isActive: true 
            });
        }
        
        console.log('[MediaManager] Microphone initialized and ACTIVE, producer:', client.audioProducer.id);
        return true;
        
    } catch (error) {
        console.error('[MediaManager] Failed to init microphone:', error.message, error.stack);
        
        // Сбрасываем состояние при ошибке
        client.isMicActive = false;
        client.isMicPaused = true;
        client.audioProducer = null;
        
        if (client.stream) {
            client.stream.getTracks().forEach(t => t.stop());
            client.stream = null;
        }
        
        UIManager.showNotification('❌ Ошибка микрофона: ' + error.message, 'error', 4000);
        throw error;
    }
}

    static _waitForTransportReady(transport, type, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            if (transport.connectionState === 'connected') {
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Transport ${type} ready timeout`));
            }, timeoutMs);
            
            const onStateChange = (state) => {
                if (state === 'connected') {
                    cleanup();
                    resolve();
                } else if (state === 'failed' || state === 'closed') {
                    cleanup();
                    reject(new Error(`Transport ${type} entered ${state}`));
                }
            };
            
            const cleanup = () => {
                clearTimeout(timeout);
                transport.off('connectionstatechange', onStateChange);
            };
            
            transport.on('connectionstatechange', onStateChange);
        });
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
        if (!client.audioProducer || client.audioProducer.closed) {
            console.log('[MediaManager] Cannot resume: microphone not initialized');
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
        client.isMicPaused = true;
    }

static async createConsumer(client, consumerParams) {
    if (!client.recvTransport || client.recvTransport.closed || client.recvTransport.connectionState === 'failed') {
        throw new Error('Recv transport is missing, closed, or failed');
    }
    
    // Не проверяем активность продюсера - Consumer создаётся в любом случае
    // Если продюсер на паузе, Consumer будет получать тишину, но когда продюсер возобновится,
    // звук появится автоматически
    
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
    
    audioElement.style.cssText = `
        position: fixed !important;
        top: -9999px !important;
        left: -9999px !important;
        width: 1px !important;
        height: 1px !important;
        opacity: 0 !important;
        pointer-events: none !important;
        visibility: hidden !important;
    `;
    
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

    static disconnect(client) {
        // 🔥 Сбрасываем флаги
        client._micInitInProgress = false;
        client._micInitPromise = null;
        client._sendTransportReady = false;
        
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
        
        client.device = null;
        client.isConnected = false;
        client.isMicActive = false;
        client.isMicPaused = true;
    }
}

export default MediaManager;

