class MediaManager {
    static async connect(client, roomId, mediaData) {
        try {
            console.log('[MEDIA] Подключение к медиасерверу...');
            
            if (typeof mediasoupClient === 'undefined') {
                throw new Error('Библиотека mediasoup-client не загружена');
            }
            
            // Инициализируем устройство
            client.device = new mediasoupClient.Device();
            await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
            
            console.log('[MEDIA] Устройство инициализировано');
            
            // Создаем транспорты
            await this.createTransports(client, mediaData);
            console.log('[MEDIA] Транспорты созданы');
            
            // Запускаем keep-alive
            this.startKeepAlive(client, roomId);
            
            client.isConnected = true;
            client.isMicActive = false;
            
            // Подписываемся на уведомления
            this.subscribeToProducerNotifications(client, roomId);
            
            console.log('[MEDIA] Подключение успешно');
            
        } catch (error) {
            console.error('[MEDIA] Ошибка подключения:', error);
            throw new Error(`Media connection failed: ${error.message}`);
        }
    }
    static async createTransports(client, mediaData) {
        try {
            // Проверяем существующие транспорты
            if (!client.sendTransport) {
                client.sendTransport = client.device.createSendTransport({
                    id: mediaData.sendTransport.id,
                    iceParameters: mediaData.sendTransport.iceParameters,
                    iceCandidates: mediaData.sendTransport.iceCandidates,
                    dtlsParameters: mediaData.sendTransport.dtlsParameters
                });
                this.setupSendTransportHandlers(client, mediaData);
            }
            if (!client.recvTransport) {
                client.recvTransport = client.device.createRecvTransport({
                    id: mediaData.recvTransport.id,
                    iceParameters: mediaData.recvTransport.iceParameters,
                    iceCandidates: mediaData.recvTransport.iceCandidates,
                    dtlsParameters: mediaData.recvTransport.dtlsParameters
                });
                this.setupRecvTransportHandlers(client, mediaData);
            }
            
        } catch (error) {
            console.error('[MEDIA] Ошибка создания транспортов:', error);
            throw error;
        }
    }
    static setupSendTransportHandlers(client, mediaData) {
        client.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                console.log('[MEDIA] Подключение sendTransport...');
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
                
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                
                const data = await response.json();
                
                // Уведомляем о новом продюсере
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
    static setupRecvTransportHandlers(client, mediaData) {
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
        try {
            console.log('[MEDIA] Запуск микрофона...');
            
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
            
            console.log('[MEDIA] Микрофон доступен, создаем producer...');
            
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
            console.log('[MEDIA] Microphone producer создан:', client.audioProducer.id);
            
        } catch (error) {
            console.error('[MEDIA] Ошибка запуска микрофона:', error);
            
            if (client.stream) {
                client.stream.getTracks().forEach(track => track.stop());
                client.stream = null;
            }
            
            throw new Error(`Microphone failed: ${error.message}`);
        }
    }
    static async stopMicrophone(client) {
        try {
            console.log('[MEDIA] Остановка микрофона...');
            
            if (client.audioProducer) {
                try {
                    await fetch(`${client.mediaData.mediaServerUrl}/api/producer/close`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            producerId: client.audioProducer.id
                        })
                    });
                } catch (error) {
                    console.warn('[MEDIA] Не удалось закрыть producer на сервере:', error);
                }
                
                client.audioProducer.close();
                client.audioProducer = null;
            }
            
            if (client.stream) {
                client.stream.getTracks().forEach(track => track.stop());
                client.stream = null;
            }
            
            client.isMicActive = false;
            console.log('[MEDIA] Микрофон остановлен');
            
        } catch (error) {
            console.error('[MEDIA] Ошибка остановки микрофона:', error);
            throw new Error(`Microphone stop failed: ${error.message}`);
        }
    }
    static startKeepAlive(client, roomId) {
        console.log('[MEDIA] Запуск keep-alive...');
        
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
        }
        
        client.keepAliveInterval = setInterval(() => {
            fetch(`${client.mediaData.mediaServerUrl}/api/health`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: client.clientID,
                    roomId: roomId
                })
            })
            .then(response => {
                if (!response.ok) {
                    console.warn('[MEDIA] Keep-alive запрос неуспешен');
                }
            })
            .catch(error => {
                console.warn('[MEDIA] Ошибка keep-alive:', error);
            });
        }, 10000);
    }
    static subscribeToProducerNotifications(client, roomId) {
        // Подписываемся на уведомления через API сервер
        if (client.socket) {
            client.socket.emit('subscribe-to-producers', { roomId });
            
            client.socket.on('new-producer', (data) => {
                console.log('[MEDIA] Получено уведомление о новом продюсере:', data.producerId);
                
                // Немедленно создаем consumer для нового producer
                if (data.clientID !== client.clientID) {
                    this.createConsumer(client, data.producerId).then(consumer => {
                        if (consumer) {
                            client.existingProducers.add(data.producerId);
                            console.log('[MEDIA] Consumer создан по уведомлению:', consumer.id);
                        }
                    });
                }
            });
        }
    }
    static async createConsumer(client, producerId) {
        try {
            // Проверяем существующий consumer
            if (client.consumers.has(producerId)) {
                return client.consumers.get(producerId);
            }
            
            console.log('[MEDIA] Создание consumer для producer:', producerId);
            
            const response = await fetch(`${client.mediaData.mediaServerUrl}/api/consume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            
            // Создаем аудио элемент
            const audio = new Audio();
            const stream = new MediaStream([consumer.track.clone()]);
            audio.srcObject = stream;
            audio.autoplay = true;
            audio.volume = 0.8;
            audio.style.display = 'none';
            
            if (!window.audioElements) window.audioElements = new Map();
            window.audioElements.set(producerId, audio);
            document.body.appendChild(audio);
            
            console.log('[MEDIA] Consumer создан:', consumer.id);
            return consumer;
            
        } catch (error) {
            console.error('[MEDIA] Ошибка создания consumer:', error);
            throw error;
        }
    }
    static disconnect(client) {
        console.log('[MEDIA] Отключение от медиасервера...');
        
        // Останавливаем keep-alive
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
            client.keepAliveInterval = null;
        }
        
        // Останавливаем микрофон
        if (client.isMicActive) {
            this.stopMicrophone(client).catch(console.error);
        }
        
        // Закрываем транспорты
        if (client.sendTransport) {
            try {
                client.sendTransport.close();
            } catch (error) {
                console.warn('[MEDIA] Ошибка закрытия sendTransport:', error);
            }
            client.sendTransport = null;
        }
        
        if (client.recvTransport) {
            try {
                client.recvTransport.close();
            } catch (error) {
                console.warn('[MEDIA] Ошибка закрытия recvTransport:', error);
            }
            client.recvTransport = null;
        }
        
        // Закрываем consumers
        client.consumers.forEach(consumer => {
            try {
                consumer.close();
            } catch (error) {
                console.warn('[MEDIA] Ошибка закрытия consumer:', error);
            }
        });
        client.consumers.clear();
        
        // Очищаем аудио элементы
        if (window.audioElements) {
            window.audioElements.forEach(audio => {
                try {
                    audio.pause();
                    audio.srcObject = null;
                    audio.remove();
                } catch (error) {
                    console.warn('[MEDIA] Ошибка очистки аудио элемента:', error);
                }
            });
            window.audioElements.clear();
        }
        
        client.device = null;
        client.isConnected = false;
        console.log('[MEDIA] Отключение завершено');
    }
}
export default MediaManager;
