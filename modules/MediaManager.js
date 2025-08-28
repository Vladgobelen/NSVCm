class MediaManager {
static async connect(client, roomId, mediaData) {
    try {
        console.log('[MEDIA] Подключение к медиасерверу как слушатель...');
        
        // Проверяем, загружена ли библиотека mediasoup
        if (typeof mediasoupClient === 'undefined') {
            throw new Error('Библиотека mediasoup-client не загружена');
        }
        
        // Создаем устройство mediasoup
        client.device = new mediasoupClient.Device();
        
        // Загружаем RTP capabilities
        await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
        console.log('[MEDIA] Устройство инициализировано');
        
        // Создаем транспорты
        await this.createTransports(client, mediaData);
        console.log('[MEDIA] Транспорты созданы');
        
        // Подключаемся только как слушатель - не запускаем микрофон
        console.log('[MEDIA] Режим слушателя активирован');
        
        // Запускаем keep-alive
        this.startKeepAlive(client, roomId);
        
        client.isConnected = true;
        client.isMicActive = false; // Явно указываем, что микрофон выключен
        console.log('[MEDIA] Подключение к медиасерверу успешно (режим слушателя)');
        
    } catch (error) {
        console.error('[MEDIA] Ошибка подключения к медиасерверу:', error);
        throw new Error(`Media connection failed: ${error.message}`);
    }
}
    static async createTransports(client, mediaData) {
        try {
            // Создаем транспорт для отправки медиа
            client.sendTransport = client.device.createSendTransport({
                id: mediaData.sendTransport.id,
                iceParameters: mediaData.sendTransport.iceParameters,
                iceCandidates: mediaData.sendTransport.iceCandidates,
                dtlsParameters: mediaData.sendTransport.dtlsParameters
            });

            // Создаем транспорт для получения медиа
            client.recvTransport = client.device.createRecvTransport({
                id: mediaData.recvTransport.id,
                iceParameters: mediaData.recvTransport.iceParameters,
                iceCandidates: mediaData.recvTransport.iceCandidates,
                dtlsParameters: mediaData.recvTransport.dtlsParameters
            });

            console.log('[MEDIA] Транспорты созданы, настраиваем обработчики...');

            // Настраиваем обработчики событий для транспортов
            this.setupTransportHandlers(client, mediaData);
            
        } catch (error) {
            console.error('[MEDIA] Ошибка создания транспортов:', error);
            throw new Error(`Transport creation failed: ${error.message}`);
        }
    }

    static setupTransportHandlers(client, mediaData) {
        // Обработчики для sendTransport
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
                console.log('[MEDIA] sendTransport подключен');
                callback();
            } catch (error) {
                console.error('[MEDIA] Ошибка подключения sendTransport:', error);
                errback(error);
            }
        });

        client.sendTransport.on('produce', async (parameters, callback, errback) => {
            try {
                console.log('[MEDIA] Создание producer...');
                const response = await fetch(`${mediaData.mediaServerUrl}/api/produce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transportId: client.sendTransport.id,
                        kind: parameters.kind,
                        rtpParameters: parameters.rtpParameters
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP error: ${response.status}`);
                }
                
                const data = await response.json();
                console.log('[MEDIA] Producer создан:', data.producerId);
                callback({ id: data.producerId });
            } catch (error) {
                console.error('[MEDIA] Ошибка создания producer:', error);
                errback(error);
            }
        });

        // Обработчики для recvTransport
        client.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                console.log('[MEDIA] Подключение recvTransport...');
                await fetch(`${mediaData.mediaServerUrl}/api/transport/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transportId: client.recvTransport.id,
                        dtlsParameters
                    })
                });
                console.log('[MEDIA] recvTransport подключен');
                callback();
            } catch (error) {
                console.error('[MEDIA] Ошибка подключения recvTransport:', error);
                errback(error);
            }
        });
    }

static async startMicrophone(client) {
    try {
        console.log('[MEDIA] Запуск микрофона...');
        
        // Проверяем, инициализированы ли транспорты
        if (!client.sendTransport) {
            throw new Error('Send transport не инициализирован');
        }

        // Запрашиваем доступ к микрофону (это вызовет запрос разрешения у пользователя)
        client.stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 48000,
                channelCount: 2
            }
        });
        
        console.log('[MEDIA] Микрофон доступен, создаем producer...');
        
        // Создаем audio producer
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
        
        // Останавливаем все треки, если они были захвачены
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
                // Закрываем producer на сервере
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
                
                // Закрываем producer локально
                client.audioProducer.close();
                client.audioProducer = null;
            }
            
            if (client.stream) {
                // Останавливаем все треки
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
        }, 10000); // Отправляем каждые 10 секунд
    }

static async createConsumer(client, producerId) {
    try {
        console.log('[MEDIA] Создание consumer для producer:', producerId);
        
        // Проверяем, инициализированы ли необходимые компоненты
        if (!client.device) {
            throw new Error('Устройство не инициализировано');
        }
        if (!client.recvTransport) {
            throw new Error('Транспорт для приема не инициализирован');
        }
        if (!client.mediaData || !client.mediaData.mediaServerUrl) {
            throw new Error('Данные медиасервера не инициализированы');
        }

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
            const errorText = await response.text();
            throw new Error(`HTTP error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        // Создаем consumer
        const consumer = await client.recvTransport.consume({
            id: data.id,
            producerId: data.producerId,
            kind: data.kind,
            rtpParameters: data.rtpParameters
        });
        
        client.consumers.set(producerId, consumer);
        
        // Создаем и настраиваем аудио элемент
        const audio = new Audio();
        const stream = new MediaStream([consumer.track.clone()]);
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.volume = 0.8;
        
        // Добавляем аудио элемент в DOM (скрыто)
        audio.style.display = 'none';
        document.body.appendChild(audio);
        
        if (!window.audioElements) window.audioElements = new Map();
        window.audioElements.set(producerId, audio);
        
        console.log('[MEDIA] Consumer создан:', consumer.id);
        
        return consumer;
    } catch (error) {
        console.error('[MEDIA] Ошибка создания consumer:', error);
        throw new Error(`Consumer creation failed: ${error.message}`);
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
        this.stopMicrophone(client).catch(error => {
            console.warn('[MEDIA] Ошибка при остановке микрофона:', error);
        });
        
        // Закрываем транспорты
        if (client.sendTransport) {
            client.sendTransport.close();
            client.sendTransport = null;
        }
        
        if (client.recvTransport) {
            client.recvTransport.close();
            client.recvTransport = null;
        }
        
        // Закрываем все consumers
        client.consumers.forEach(consumer => {
            try {
                consumer.close();
            } catch (error) {
                console.warn('[MEDIA] Ошибка при закрытии consumer:', error);
            }
        });
        client.consumers.clear();
        
        // Очищаем существующие producers
        client.existingProducers.clear();
        
        // Удаляем все аудио элементы
        if (window.audioElements) {
            window.audioElements.forEach(audio => {
                try {
                    audio.pause();
                    audio.srcObject = null;
                } catch (error) {
                    console.warn('[MEDIA] Ошибка при очистке аудио элемента:', error);
                }
            });
            window.audioElements.clear();
        }
        
        client.isConnected = false;
        console.log('[MEDIA] Отключение от медиасервера завершено');
    }
}

export default MediaManager;
