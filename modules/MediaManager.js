// modules/MediaManager.js
import VolumeBoostManager from './VolumeBoostManager.js';
import UIManager from './UIManager.js';
import MembersManager from './MembersManager.js';

class MediaManager {
    static async connect(client, roomId, mediaData) {
        try {
            if (typeof mediasoupClient === 'undefined') {
                throw new Error('Библиотека mediasoup-client не загружена');
            }
            client.device = new mediasoupClient.Device();
            await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
            await this.createTransports(client, mediaData);
            this.startKeepAlive(client, roomId);
            client.isConnected = true;
            client.isMicActive = false;
            client.existingProducers = new Set();
            client.consumerState = new Map();
            console.log(`🔗 [MEDIA] Connected to room ${roomId}, device loaded`);
            await this.requestCurrentProducers(client, roomId);
        } catch (error) {
            console.error('MediaManager connection failed:', error);
            throw new Error(`Media connection failed: ${error.message}`);
        }
    }

    static async enableMicrophone(client) {
        console.log(`🎤 [MIC] Enabling microphone, current state: active=${client.isMicActive}`);
        if (client.audioProducer && client.audioProducer.track) {
            if (client.audioProducer.closed || (client.sendTransport && client.sendTransport.closed)) {
                console.log(`🔁 [MIC] Producer or transport closed, restarting...`);
                await MediaManager.stopMicrophone(client, false);
                await MediaManager.startMicrophone(client);
                return true;
            }
            client.audioProducer.track.enabled = true;
            client.isMicActive = true;
            console.log(`✅ [MIC] Microphone enabled (track enabled)`);
            return true;
        } else {
            console.log(`🔁 [MIC] No producer, starting new microphone...`);
            await MediaManager.startMicrophone(client);
            return true;
        }
    }

    static async disableMicrophone(client) {
        console.log(`🔇 [MIC] Disabling microphone`);
        if (client.audioProducer && client.audioProducer.track) {
            client.audioProducer.track.enabled = false;
            client.isMicActive = false;
            console.log(`✅ [MIC] Microphone disabled`);
            return true;
        } else {
            console.warn(`⚠️ [MIC] No producer to disable`);
            return false;
        }
    }

    static async createTransports(client, mediaData) {
        try {
            if (!client.sendTransport) {
                client.sendTransport = client.device.createSendTransport({
                    id: mediaData.sendTransport.id,
                    iceParameters: mediaData.sendTransport.iceParameters,
                    iceCandidates: mediaData.sendTransport.iceCandidates,
                    dtlsParameters: mediaData.sendTransport.dtlsParameters
                });
                this.setupSendTransportHandlers(client);
                console.log(`📤 [TRANSPORT] Send transport created: ${client.sendTransport.id}`);
            }
            if (!client.recvTransport) {
                client.recvTransport = client.device.createRecvTransport({
                    id: mediaData.recvTransport.id,
                    iceParameters: mediaData.recvTransport.iceParameters,
                    iceCandidates: mediaData.recvTransport.iceCandidates,
                    dtlsParameters: mediaData.recvTransport.dtlsParameters
                });
                this.setupRecvTransportHandlers(client);
                console.log(`📥 [TRANSPORT] Recv transport created: ${client.recvTransport.id}`);
            }
        } catch (error) {
            console.error('Error creating transports:', error);
            throw error;
        }
    }

    static _setupTransportConnectHandler(client, transport) {
        transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            console.log(`🔗 [TRANSPORT] Connecting transport ${transport.id}...`);
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                await fetch(`${client.API_SERVER_URL}/api/media/transport/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${client.token}`
                    },
                    body: JSON.stringify({
                        transportId: transport.id,
                        dtlsParameters: dtlsParameters
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                console.log(`✅ [TRANSPORT] Transport ${transport.id} connected`);
                callback();
            } catch (error) {
                console.error('Transport connection failed:', error);
                errback(error);
            }
        });
        transport.on('connectionstatechange', (state) => {
            console.log(`📊 [TRANSPORT] ${transport.id} state: ${state}`);
        });
    }

    static setupSendTransportHandlers(client) {
        this._setupTransportConnectHandler(client, client.sendTransport);
        client.sendTransport.on('produce', async (parameters, callback, errback) => {
            try {
                console.log(`🎤 [PRODUCE] Creating producer, kind=${parameters.kind}`);
                const response = await fetch(`${client.API_SERVER_URL}/api/media/produce`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${client.token}`
                    },
                    body: JSON.stringify({
                        transportId: client.sendTransport.id,
                        kind: parameters.kind,
                        rtpParameters: parameters.rtpParameters,
                        clientId: client.clientID,
                        roomId: client.currentRoom
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Produce failed:', response.status, errorText);
                    throw new Error(`HTTP error: ${response.status}`);
                }
                const data = await response.json();
                console.log(`✅ [PRODUCE] Producer created: ${data.producerId}`);
                callback({ id: data.producerId });
            } catch (error) {
                console.error('Produce failed:', error);
                errback(error);
            }
        });
    }

    static setupRecvTransportHandlers(client) {
        this._setupTransportConnectHandler(client, client.recvTransport);
    }

    static async startMicrophone(client) {
        try {
            if (!client.sendTransport) {
                throw new Error('Send transport не инициализирован');
            }
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1,
                    latency: 0.1,
                    sampleSize: 16
                }
            };
            console.log(`🎤 [MIC] Requesting microphone access...`);
            client.stream = await navigator.mediaDevices.getUserMedia(constraints);
            const track = client.stream.getAudioTracks()[0];
            console.log(`🎤 [MIC] Producing audio track...`);
            client.audioProducer = await client.sendTransport.produce({
                track,
                encodings: [
                    {
                        maxBitrate: 24000,
                        dtx: true
                    }
                ],
                appData: {
                    clientID: client.clientID,
                    roomId: client.currentRoom
                }
            });
            client.isMicActive = true;
            console.log(`✅ [MIC] Microphone started, producer ID: ${client.audioProducer.id}`);
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
            console.error('Microphone start failed:', error);
            if (client.stream) {
                client.stream.getTracks().forEach(track => track.stop());
                client.stream = null;
            }
            throw error;
        }
    }

    static async stopMicrophone(client, closeTransport = true) {
        try {
            if (client.audioProducer) {
                try {
                    console.log(`🔴 [MIC] Closing producer ${client.audioProducer.id}...`);
                    await fetch(`${client.API_SERVER_URL}/api/media/producer/close`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${client.token}`
                        },
                        body: JSON.stringify({
                            producerId: client.audioProducer.id
                        })
                    });
                    console.log(`✅ [MIC] Producer closed on server`);
                } catch (error) {
                    console.error('Error closing producer on server:', error);
                }
                client.audioProducer.close();
                client.audioProducer = null;
            }
            if (client.stream) {
                client.stream.getTracks().forEach(track => track.stop());
                client.stream = null;
            }
            if (closeTransport && client.sendTransport) {
                try {
                    client.sendTransport.close();
                } catch (error) {
                    console.error('Error closing send transport:', error);
                }
                client.sendTransport = null;
            }
            client.isMicActive = false;
            console.log(`✅ [MIC] Microphone stopped`);
        } catch (error) {
            console.error('Microphone stop failed:', error);
            throw new Error(`Microphone stop failed: ${error.message}`);
        }
    }

    static startKeepAlive(client, roomId) {
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
        }
        client.keepAliveInterval = setInterval(() => {
            fetch(`${client.API_SERVER_URL}/api/media/health`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    clientId: client.clientID,
                    roomId: roomId
                })
            }).catch(() => {
                // Keep-alive failure ignored
            });
        }, 10000);
    }

    static async requestCurrentProducers(client, roomId) {
        try {
            console.log(`📡 [PRODUCERS] Requesting current producers for room ${roomId}...`);
            const response = await fetch(`${client.API_SERVER_URL}/api/media/rooms/${roomId}/producers`, {
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            if (!response.ok) {
                console.error(`❌ [PRODUCERS] HTTP ${response.status}`);
                return;
            }
            const data = await response.json();
            if (!data || !data.producers || !Array.isArray(data.producers)) {
                console.warn(`⚠️ [PRODUCERS] No producers data received`);
                return;
            }
            console.log(`📡 [PRODUCERS] Received ${data.producers.length} producers`);
            for (const producer of data.producers) {
                if (producer.clientID !== client.clientID) {
                    console.log(`🎧 [PRODUCERS] Creating consumer for producer ${producer.id} (client: ${producer.clientID})`);
                    await client.ensureConsumer(producer.id, producer);
                    if (!window.producerUserMap) window.producerUserMap = new Map();
                    const members = MembersManager.getMembers();
                    const member = members.find(m => m.clientId === producer.clientID);
                    if (member?.userId) {
                        window.producerUserMap.set(producer.id, member.userId);
                        UIManager.showVolumeSliderByUserId(producer.id, member.userId);
                        console.log(`✅ [PRODUCERS] Mapped producer ${producer.id} → user ${member.userId}`);
                    }
                } else {
                    console.log(`🎤 [PRODUCERS] Skipping own producer ${producer.id}`);
                    client.consumerState.set(producer.id, {
                        status: 'own-producer',
                        consumer: null,
                        lastError: null
                    });
                }
            }
        } catch (error) {
            console.error('Error requesting current producers:', error);
        }
    }

    static async createConsumer(client, producerId, retries = 3, producerData = {}) {
        console.log(`🎧 [CONSUMER] Creating consumer for producer ${producerId}, attempt 1/${retries}`);
        // 🔥 ПРОВЕРКА 1: Не создавать консьюмер на свой продюсер по ID
        if (client.audioProducer && client.audioProducer.id === producerId) {
            console.log(`🚫 [CONSUMER] Skipping own producer by ID`);
            throw new Error('Cannot consume own producer');
        }
        // 🔥 ПРОВЕРКА 2: Не создавать консьюмер на продюсер с тем же clientID
        if (producerData.clientID && producerData.clientID === client.clientID) {
            console.log(`🚫 [CONSUMER] Skipping own producer by clientID`);
            throw new Error('Cannot consume own audio by clientID');
        }
        // 🔥 Проверка существующего консьюмера
        if (client.consumerState.has(producerId)) {
            const state = client.consumerState.get(producerId);
            if (state?.status === 'active' && state?.consumer && !state.consumer.closed) {
                console.log(`✅ [CONSUMER] Reusing existing active consumer`);
                return state.consumer;
            }
            if (state?.status === 'creating') {
                console.log(`⏳ [CONSUMER] Waiting for existing consumer creation...`);
                for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const newState = client.consumerState.get(producerId);
                    if (newState?.status !== 'creating') break;
                }
                const finalState = client.consumerState.get(producerId);
                if (finalState?.status === 'active' && finalState?.consumer) {
                    return finalState.consumer;
                }
            }
        }
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`🎧 [CONSUMER] Fetch consume API, attempt ${attempt}/${retries}`);
                const response = await fetch(`${client.API_SERVER_URL}/api/media/consume`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${client.token}`
                    },
                    body: JSON.stringify({
                        producerId: producerId,
                        rtpCapabilities: client.device.rtpCapabilities,
                        transportId: client.recvTransport.id,
                        clientId: client.clientID
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ [CONSUMER] HTTP ${response.status}: ${errorText}`);
                    if (response.status === 400 && errorText.includes('own audio')) {
                        throw new Error('Cannot consume own audio');
                    }
                    if (response.status === 404) {
                        console.error(`❌ [CONSUMER] Producer not found on server!`);
                        throw new Error('Producer not found');
                    }
                    throw new Error(`HTTP error: ${response.status}`);
                }
                const data = await response.json();
                console.log(`📦 [CONSUMER] Received consumer data:`, data);
                if (!data || !data.id) {
                    console.error('Invalid consumer data received:', data);
                    throw new Error('Invalid consumer data received');
                }
                console.log(`🎧 [CONSUMER] Consuming from recvTransport...`);
                const consumer = await client.recvTransport.consume({
                    id: data.id,
                    producerId: data.producerId,
                    kind: data.kind,
                    rtpParameters: data.rtpParameters
                });
                console.log(`✅ [CONSUMER] Consumer created: ${consumer.id}`);
                client.consumerState.set(producerId, {
                    status: 'active',
                    consumer: consumer,
                    lastError: null
                });
                let audioElement = window.audioElements?.get(producerId);
                if (!audioElement || audioElement.closed) {
                    audioElement = new Audio();
                    audioElement.id = `audio-${producerId}`;
                    audioElement.autoplay = true;
                    audioElement.volume = 1.0;
                    audioElement.style.display = 'none';
                    if (!window.audioElements) window.audioElements = new Map();
                    window.audioElements.set(producerId, audioElement);
                    document.body.appendChild(audioElement);
                    console.log(`🔊 [CONSUMER] Created audio element for ${producerId}`);
                }
                const stream = new MediaStream([consumer.track.clone()]);
                audioElement.srcObject = stream;
                console.log(`🔊 [CONSUMER] Attached stream to audio element`);
                if (producerData.userId) {
                    if (VolumeBoostManager.isChromeOrEdge()) {
                        setTimeout(async () => {
                            await VolumeBoostManager.attachToAudioElement(audioElement, producerData.userId, 1.0);
                        }, 500);
                    } else {
                        await VolumeBoostManager.attachToAudioElement(audioElement, producerData.userId, 1.0);
                    }
                }
                if (producerData.userId) {
                    if (!window.producerUserMap) window.producerUserMap = new Map();
                    window.producerUserMap.set(data.producerId, producerData.userId);
                } else if (producerData.clientID) {
                    if (!window.producerClientMap) window.producerClientMap = new Map();
                    window.producerClientMap.set(data.producerId, producerData.clientID);
                }
                consumer.on('transportclose', () => {
                    console.log(`⚠️ [CONSUMER] Transport closed for ${consumer.id}`);
                    consumer.transportClosed = true;
                    client.consumerState.set(producerId, {
                        status: 'transport-closed',
                        consumer: consumer,
                        lastError: null
                    });
                });
                consumer.on('trackended', () => {
                    console.log(`⚠️ [CONSUMER] Track ended for ${consumer.id}`);
                    client.consumerState.set(producerId, {
                        status: 'track-ended',
                        consumer: consumer,
                        lastError: null
                    });
                });
                return consumer;
            } catch (error) {
                console.error(`❌ [CONSUMER] Error attempt ${attempt}/${retries}:`, error.message);
                if (error.message.includes('consume own') ||
                    error.message.includes('own audio') ||
                    error.message.includes('400') ||
                    error.message.includes('Cannot consume own')) {
                    client.consumerState.set(producerId, {
                        status: 'own-producer',
                        consumer: null,
                        lastError: null
                    });
                    throw error;
                }
                if (attempt === retries) {
                    client.consumerState.set(producerId, {
                        status: 'error',
                        consumer: null,
                        lastError: error
                    });
                    throw error;
                }
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`⏳ [CONSUMER] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    static disconnect(client) {
        console.log(`🔌 [MEDIA] Disconnecting...`);
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
            client.keepAliveInterval = null;
        }
        if (client.isMicActive) {
            this.stopMicrophone(client).catch(() => {
                console.error('Error stopping microphone during disconnect');
            });
        }
        if (client.sendTransport) {
            try {
                client.sendTransport.close();
            } catch (error) {
                console.error('Error closing send transport:', error);
            }
            client.sendTransport = null;
        }
        if (client.recvTransport) {
            try {
                client.recvTransport.close();
            } catch (error) {
                console.error('Error closing receive transport:', error);
            }
            client.recvTransport = null;
        }
        client.consumerState.forEach((state, producerId) => {
            if (state?.consumer && !state.consumer.closed) {
                try {
                    state.consumer.close();
                } catch (error) {
                    console.error('Error closing consumer:', error);
                }
            }
        });
        client.consumerState.clear();
        if (window.audioElements) {
            window.audioElements.forEach(audio => {
                try {
                    audio.pause();
                    audio.srcObject = null;
                    audio.remove();
                    const producerId = audio.id.replace('audio-', '');
                    const userId = window.producerUserMap?.get(producerId);
                    if (userId) {
                        VolumeBoostManager.detach(userId);
                    }
                } catch (error) {
                    console.error('Error cleaning up audio element:', error);
                }
            });
            window.audioElements.clear();
        }
        client.device = null;
        client.isConnected = false;
        client.existingProducers.clear();
        console.log(`✅ [MEDIA] Disconnected`);
    }

    static async handleNewProducer(client, producerData) {
        console.log(`📡 [NEW-PRODUCER] Received notification:`, producerData);
        if (producerData.clientID !== client.clientID) {
            try {
                await this.createConsumer(client, producerData.producerId, 3, producerData);
                client.existingProducers.add(producerData.producerId);
            } catch (error) {
                console.error('Error creating consumer from notification:', error);
            }
        } else {
            console.log(`🎤 [NEW-PRODUCER] Skipping own producer`);
            client.consumerState.set(producerData.producerId, {
                status: 'own-producer',
                consumer: null,
                lastError: null
            });
        }
    }
}

export default MediaManager;
