class MediaManager {
    static async connect(client, roomId, mediaData) {
        console.log('MediaManager connecting to room:', roomId);
        
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
            
            this.subscribeToProducerNotifications(client, roomId);
            this.startProducerSync(client);
            
            console.log('MediaManager connected successfully');
            
        } catch (error) {
            console.error('MediaManager connection failed:', error);
            throw new Error(`Media connection failed: ${error.message}`);
        }
    }

    static async createTransports(client, mediaData) {
        console.log('Creating transports for client:', client.clientID);
        
        try {
            if (!client.sendTransport) {
                console.log('Creating send transport');
                client.sendTransport = client.device.createSendTransport({
                    id: mediaData.sendTransport.id,
                    iceParameters: mediaData.sendTransport.iceParameters,
                    iceCandidates: mediaData.sendTransport.iceCandidates,
                    dtlsParameters: mediaData.sendTransport.dtlsParameters
                });
                this.setupSendTransportHandlers(client);
            } else {
                console.log('Send transport already exists, reusing');
            }
            
            if (!client.recvTransport) {
                console.log('Creating receive transport');
                client.recvTransport = client.device.createRecvTransport({
                    id: mediaData.recvTransport.id,
                    iceParameters: mediaData.recvTransport.iceParameters,
                    iceCandidates: mediaData.recvTransport.iceCandidates,
                    dtlsParameters: mediaData.recvTransport.dtlsParameters
                });
                this.setupRecvTransportHandlers(client);
            } else {
                console.log('Receive transport already exists, reusing');
            }
            
        } catch (error) {
            console.error('Error creating transports:', error);
            throw error;
        }
    }

    static setupSendTransportHandlers(client) {
        console.log('Setting up send transport handlers');
        
        client.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            console.log('Send transport connecting...');
            
            try {
                await fetch(`${client.API_SERVER_URL}/api/media/transport/connect`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${client.token}`
                    },
                    body: JSON.stringify({
                        transportId: client.sendTransport.id,
                        dtlsParameters
                    })
                });
                console.log('Send transport connected successfully');
                callback();
            } catch (error) {
                console.error('Send transport connection failed:', error);
                errback(error);
            }
        });

        client.sendTransport.on('produce', async (parameters, callback, errback) => {
            console.log('Producing media:', parameters.kind);
            
            try {
                const response = await fetch(`${client.API_SERVER_URL}/api/media/produce`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${client.token}`
                    },
                    body: JSON.stringify({
                        transportId: client.sendTransport.id,
                        kind: parameters.kind,
                        rtpParameters: parameters.rtpParameters
                    })
                });
                
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                
                const data = await response.json();
                
                if (client.socket) {
                    client.socket.emit('new-producer-notification', {
                        roomId: client.currentRoom,
                        producerId: data.producerId,
                        clientID: client.clientID,
                        kind: parameters.kind
                    });
                }
                
                console.log('Media produced successfully:', data.producerId);
                callback({ id: data.producerId });
            } catch (error) {
                console.error('Produce failed:', error);
                errback(error);
            }
        });
    }

    static setupRecvTransportHandlers(client) {
        console.log('Setting up receive transport handlers');
        
        client.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            console.log('Receive transport connecting...');
            
            try {
                await fetch(`${client.API_SERVER_URL}/api/media/transport/connect`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${client.token}`
                    },
                    body: JSON.stringify({
                        transportId: client.recvTransport.id,
                        dtlsParameters
                    })
                });
                console.log('Receive transport connected successfully');
                callback();
            } catch (error) {
                console.error('Receive transport connection failed:', error);
                errback(error);
            }
        });
    }

static async startMicrophone(client) {
    console.log('Starting microphone for client:', client.clientID);
    
    try {
        if (!client.sendTransport) {
            throw new Error('Send transport не инициализирован');
        }
        
        client.stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 48000,
                channelCount: 2
            }
        });
        
        const track = client.stream.getAudioTracks()[0];
        client.audioProducer = await client.sendTransport.produce({
            track,
            encodings: [{ 
                maxBitrate: client.bitrate,
                dtx: client.dtxEnabled
            }],
            codecOptions: {
                opusStereo: true,
                opusDtx: client.dtxEnabled,
                opusFec: client.fecEnabled
            },
            appData: { 
                clientID: client.clientID, 
                roomId: client.currentRoom 
            }
        });
        
        client.isMicActive = true;
        console.log('Microphone started successfully');
        
        // НЕМЕДЛЕННОЕ УВЕДОМЛЕНИЕ О НОВОМ ПРОДЮСЕРЕ
        if (client.audioProducer) {
            try {
                await fetch(`${client.API_SERVER_URL}/api/media/notify-new-producer`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${client.token}`
                    },
                    body: JSON.stringify({
                        roomId: client.currentRoom,
                        producerId: client.audioProducer.id,
                        clientID: client.clientID,
                        kind: 'audio'
                    })
                });
                console.log('✅ Producer notification sent successfully');
            } catch (error) {
                console.warn('⚠️ Failed to send producer notification:', error);
                // Не бросаем ошибку, чтобы не ломать включение микрофона
            }
        }
        
    } catch (error) {
        console.error('Microphone start failed:', error);
        
        if (client.stream) {
            client.stream.getTracks().forEach(track => track.stop());
            client.stream = null;
        }
        
        throw new Error(`Microphone failed: ${error.message}`);
    }
}
    static async stopMicrophone(client) {
        console.log('Stopping microphone for client:', client.clientID);
        
        try {
            if (client.audioProducer) {
                try {
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
                } catch (error) {
                    console.warn('Error closing producer on server:', error);
                }
                
                client.audioProducer.close();
                client.audioProducer = null;
            }
            
            if (client.stream) {
                client.stream.getTracks().forEach(track => track.stop());
                client.stream = null;
            }
            
            client.isMicActive = false;
            console.log('Microphone stopped successfully');
            
        } catch (error) {
            console.error('Microphone stop failed:', error);
            throw new Error(`Microphone stop failed: ${error.message}`);
        }
    }

    static startKeepAlive(client, roomId) {
        console.log('Starting keep-alive for client:', client.clientID);
        
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
                console.warn('Keep-alive request failed');
            });
        }, 10000);
    }

    static subscribeToProducerNotifications(client, roomId) {
        console.log('Subscribing to producer notifications for room:', roomId);
        
        if (client.socket) {
            client.socket.emit('subscribe-to-producers', { roomId });
            client.socket.emit('get-current-producers', { roomId });
            
            client.socket.on('new-producer', (data) => {
                console.log('New producer notification:', data);
                if (data.clientID !== client.clientID) {
                    this.createConsumer(client, data.producerId).then(consumer => {
                        if (consumer) {
                            client.existingProducers.add(data.producerId);
                        }
                    }).catch(error => {
                        console.error('Error creating consumer from notification:', error);
                    });
                }
            });

            client.socket.on('current-producers', (producers) => {
                console.log('Current producers list:', producers);
                producers.forEach(producer => {
                    if (producer.clientID !== client.clientID && 
                        !client.existingProducers.has(producer.id)) {
                        this.createConsumer(client, producer.id).then(consumer => {
                            if (consumer) {
                                client.existingProducers.add(producer.id);
                            }
                        }).catch(error => {
                            console.error('Error creating consumer from list:', error);
                        });
                    }
                });
            });
        }
    }

    static async createConsumer(client, producerId) {
if (client.audioProducer && producerId === client.audioProducer.id) {
        console.log('⚠️ Skipping own producer (echo protection)');
        return null;
    }        
console.log('Creating consumer for producer:', producerId);
        
        try {
            if (client.consumers.has(producerId)) {
                console.log('Consumer already exists for producer:', producerId);
                return client.consumers.get(producerId);
            }
            
            const response = await fetch(`${client.API_SERVER_URL}/api/media/consume`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    producerId,
                    rtpCapabilities: client.device.rtpCapabilities,
                    transportId: client.recvTransport.id
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            const consumer = await client.recvTransport.consume({
                id: data.id,
                producerId: data.producerId,
                kind: data.kind,
                rtpParameters: data.rtpParameters
            });
            
            client.consumers.set(producerId, consumer);
            
            const audio = new Audio();
            const stream = new MediaStream([consumer.track.clone()]);
            audio.srcObject = stream;
            audio.autoplay = true;
            audio.volume = 0.8;
            audio.style.display = 'none';
            
            if (!window.audioElements) window.audioElements = new Map();
            window.audioElements.set(producerId, audio);
            document.body.appendChild(audio);
            
            console.log('Consumer created successfully:', data.id);
            return consumer;
            
        } catch (error) {
            console.error('Error creating consumer:', error);
            throw error;
        }
    }

    static startProducerSync(client) {
        console.log('Starting to consume existing producers');
        
        if (client.producerSyncInterval) {
            clearInterval(client.producerSyncInterval);
        }
        
        client.producerSyncInterval = setInterval(async () => {
            if (!client.isConnected || !client.currentRoom) {
                return;
            }
            
            try {
                const response = await fetch(`${client.API_SERVER_URL}/api/media/rooms/${client.currentRoom}/producers`, {
                    headers: {
                        'Authorization': `Bearer ${client.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    console.warn('Failed to get producers list:', response.status);
                    return;
                }
                
                const data = await response.json();
                
                if (!data || !data.producers || !Array.isArray(data.producers)) {
                    console.warn('Invalid producers data received');
                    return;
                }
                
                console.log('Found producers:', data.producers.length);
                
                for (const producer of data.producers) {
                    if (producer.clientID !== client.clientID && 
                        !client.existingProducers.has(producer.id)) {
                        try {
                            await this.createConsumer(client, producer.id);
                            client.existingProducers.add(producer.id);
                        } catch (error) {
                            console.error('Error consuming producer:', producer.id, error);
                        }
                    }
                }
            } catch (error) {
                console.error('Error syncing producers:', error);
            }
        }, 2000);
    }

    static disconnect(client) {
        console.log('Disconnecting media for client:', client.clientID);
        
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
            client.keepAliveInterval = null;
        }
        
        if (client.producerSyncInterval) {
            clearInterval(client.producerSyncInterval);
            client.producerSyncInterval = null;
        }
        
        if (client.isMicActive) {
            this.stopMicrophone(client).catch(() => {
                console.warn('Error stopping microphone during disconnect');
            });
        }
        
        if (client.sendTransport) {
            try {
                client.sendTransport.close();
            } catch (error) {
                console.warn('Error closing send transport:', error);
            }
            client.sendTransport = null;
        }
        
        if (client.recvTransport) {
            try {
                client.recvTransport.close();
            } catch (error) {
                console.warn('Error closing receive transport:', error);
            }
            client.recvTransport = null;
        }
        
        client.consumers.forEach(consumer => {
            try {
                consumer.close();
            } catch (error) {
                console.warn('Error closing consumer:', error);
            }
        });
        client.consumers.clear();
        
        if (window.audioElements) {
            window.audioElements.forEach(audio => {
                try {
                    audio.pause();
                    audio.srcObject = null;
                    audio.remove();
                } catch (error) {
                    console.warn('Error cleaning up audio element:', error);
                }
            });
            window.audioElements.clear();
        }
        
        client.device = null;
        client.isConnected = false;
        
        console.log('Media disconnected successfully');
    }
}

export default MediaManager;
