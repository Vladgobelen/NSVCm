class MediaManager {
    static async connect(client, roomId, mediaData) {
        try {
            client.device = new mediasoupClient.Device();
            await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
            
            await this.createTransports(client, mediaData);
            await this.startMicrophone(client);
            
            this.startKeepAlive(client, roomId);
            client.isConnected = true;
            
        } catch (error) {
            throw new Error(`Media connection failed: ${error.message}`);
        }
    }

    static async createTransports(client, mediaData) {
        client.sendTransport = client.device.createSendTransport({
            id: mediaData.sendTransport.id,
            iceParameters: mediaData.sendTransport.iceParameters,
            iceCandidates: mediaData.sendTransport.iceCandidates,
            dtlsParameters: mediaData.sendTransport.dtlsParameters
        });

        client.recvTransport = client.device.createRecvTransport({
            id: mediaData.recvTransport.id,
            iceParameters: mediaData.recvTransport.iceParameters,
            iceCandidates: mediaData.recvTransport.iceCandidates,
            dtlsParameters: mediaData.recvTransport.dtlsParameters
        });

        client.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await fetch(`${mediaData.mediaServerUrl}/api/transport/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                const response = await fetch(`${mediaData.mediaServerUrl}/api/produce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transportId: client.sendTransport.id,
                        kind: parameters.kind,
                        rtpParameters: parameters.rtpParameters
                    })
                });
                const data = await response.json();
                callback({ id: data.producerId });
            } catch (error) {
                errback(error);
            }
        });

        client.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await fetch(`${mediaData.mediaServerUrl}/api/transport/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
        client.stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 48000
            }
        });
        
        const track = client.stream.getAudioTracks()[0];
        client.audioProducer = await client.sendTransport.produce({
            track,
            encodings: [{ maxBitrate: client.bitrate, dtx: client.dtxEnabled }],
            appData: { clientID: client.clientID, roomId: client.currentRoom }
        });
        
        client.isMicActive = true;
    }

    static async stopMicrophone(client) {
        if (client.audioProducer) {
            client.audioProducer.close();
            client.audioProducer = null;
        }
        
        if (client.stream) {
            client.stream.getTracks().forEach(track => track.stop());
            client.stream = null;
        }
        
        client.isMicActive = false;
    }

    static startKeepAlive(client, roomId) {
        client.keepAliveInterval = setInterval(() => {
            fetch(`${client.mediaData.mediaServerUrl}/api/health`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: client.clientID,
                    roomId: roomId
                })
            }).catch(() => {});
        }, 10000);
    }

    static async createConsumer(client, producerId) {
        try {
            const response = await fetch(`${client.mediaData.mediaServerUrl}/api/consume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    producerId,
                    rtpCapabilities: client.device.rtpCapabilities,
                    transportId: client.recvTransport.id
                })
            });
            
            if (!response.ok) throw new Error(await response.text());
            
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
            
            if (!window.audioElements) window.audioElements = new Map();
            window.audioElements.set(producerId, audio);
            
        } catch (error) {
            console.error('Ошибка создания потребителя:', error);
        }
    }

    static disconnect(client) {
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
            client.keepAliveInterval = null;
        }
        
        this.stopMicrophone(client);
        
        if (client.sendTransport) {
            client.sendTransport.close();
            client.sendTransport = null;
        }
        
        if (client.recvTransport) {
            client.recvTransport.close();
            client.recvTransport = null;
        }
        
        client.consumers.forEach(consumer => consumer.close());
        client.consumers.clear();
        client.existingProducers.clear();
        
        client.isConnected = false;
    }
}

export default MediaManager;
