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
            
            this.subscribeToProducerNotifications(client, roomId);
            
        } catch (error) {
            throw new Error(`Media connection failed: ${error.message}`);
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
            }
            if (!client.recvTransport) {
                client.recvTransport = client.device.createRecvTransport({
                    id: mediaData.recvTransport.id,
                    iceParameters: mediaData.recvTransport.iceParameters,
                    iceCandidates: mediaData.recvTransport.iceCandidates,
                    dtlsParameters: mediaData.recvTransport.dtlsParameters
                });
                this.setupRecvTransportHandlers(client);
            }
            
        } catch (error) {
            throw error;
        }
    }

    static setupSendTransportHandlers(client) {
        client.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
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
                callback();
            } catch (error) {
                errback(error);
            }
        });

        client.sendTransport.on('produce', async (parameters, callback, errback) => {
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
                
                callback({ id: data.producerId });
            } catch (error) {
                errback(error);
            }
        });
    }

    static setupRecvTransportHandlers(client) {
        client.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
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
                callback();
            } catch (error) {
                errback(error);
            }
        });
    }

    static async startMicrophone(client) {
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
            
        } catch (error) {
            if (client.stream) {
                client.stream.getTracks().forEach(track => track.stop());
                client.stream = null;
            }
            
            throw new Error(`Microphone failed: ${error.message}`);
        }
    }

    static async stopMicrophone(client) {
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
                } catch (error) {}
                
                client.audioProducer.close();
                client.audioProducer = null;
            }
            
            if (client.stream) {
                client.stream.getTracks().forEach(track => track.stop());
                client.stream = null;
            }
            
            client.isMicActive = false;
            
        } catch (error) {
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
            }).catch(() => {});
        }, 10000);
    }

    static subscribeToProducerNotifications(client, roomId) {
        if (client.socket) {
            client.socket.emit('subscribe-to-producers', { roomId });
            client.socket.emit('get-current-producers', { roomId });
            
            client.socket.on('new-producer', (data) => {
                if (data.clientID !== client.clientID) {
                    this.createConsumer(client, data.producerId).then(consumer => {
                        if (consumer) {
                            client.existingProducers.add(data.producerId);
                        }
                    }).catch(() => {});
                }
            });

            client.socket.on('current-producers', (producers) => {
                producers.forEach(producer => {
                    if (producer.clientID !== client.clientID && 
                        !client.existingProducers.has(producer.id)) {
                        this.createConsumer(client, producer.id).then(consumer => {
                            if (consumer) {
                                client.existingProducers.add(producer.id);
                            }
                        }).catch(() => {});
                    }
                });
            });
        }
    }

    static async createConsumer(client, producerId) {
        try {
            if (client.consumers.has(producerId)) {
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
            
            return consumer;
            
        } catch (error) {
            throw error;
        }
    }

    static disconnect(client) {
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
            client.keepAliveInterval = null;
        }
        
        if (client.isMicActive) {
            this.stopMicrophone(client).catch(() => {});
        }
        
        if (client.sendTransport) {
            try {
                client.sendTransport.close();
            } catch (error) {}
            client.sendTransport = null;
        }
        
        if (client.recvTransport) {
            try {
                client.recvTransport.close();
            } catch (error) {}
            client.recvTransport = null;
        }
        
        client.consumers.forEach(consumer => {
            try {
                consumer.close();
            } catch (error) {}
        });
        client.consumers.clear();
        
        if (window.audioElements) {
            window.audioElements.forEach(audio => {
                try {
                    audio.pause();
                    audio.srcObject = null;
                    audio.remove();
                } catch (error) {}
            });
            window.audioElements.clear();
        }
        
        client.device = null;
        client.isConnected = false;
    }
}

export default MediaManager;
