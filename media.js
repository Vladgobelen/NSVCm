class MediaManager {
    static async connect(client, roomId, mediaData) {
        try {
            console.log('%c[MEDIA] Подключение к медиасерверу...', 'color: blue; font-weight: bold');
            console.log('%c[MEDIA] Полученные mediaData:', 'color: blue', mediaData);
            client.updateStatus('Подключение к медиа...', 'connecting');
            
            // 1. Инициализируем устройство
            await MediaManager.loadDevice(client, mediaData.rtpCapabilities);
            
            // 2. Создаем транспорты
            await MediaManager.createTransports(client, mediaData.sendTransport, mediaData.recvTransport);
            
            // 3. Теперь можно включать микрофон
            await MediaManager.startMicrophone(client);
            
            MediaManager.startListeningForProducers(client);
            MediaManager.startKeepAlive(client, roomId);
            client.updateStatus('Подключено', 'connected');
            client.isConnected = true;
            
            console.log('%c[MEDIA] Успешно подключено к медиасерверу', 'color: green; font-weight: bold');
        } catch (error) {
            console.error('%c[MEDIA] Ошибка подключения к медиасерверу:', 'color: red', error);
            client.updateStatus('Ошибка медиа', 'disconnected');
            client.isConnected = false;
            throw error;
        }
    }

    static async loadDevice(client, rtpCapabilities) {
        try {
            console.log('%c[MEDIA] Инициализация медиаустройства...', 'color: blue');
            console.log('%c[MEDIA] RTP capabilities:', 'color: blue', rtpCapabilities);
            
            client.device = new mediasoupClient.Device();

            await client.device.load({
                routerRtpCapabilities: rtpCapabilities
            });
            
            console.log('%c[MEDIA] Устройство инициализировано', 'color: green');
            console.log('%c[MEDIA] RTP capabilities устройства:', 'color: blue', client.device.rtpCapabilities);
        } catch (error) {
            console.error('%c[MEDIA] Ошибка инициализации устройства:', 'color: red', error);
            throw error;
        }
    }

    static async createTransports(client, sendTransportData, recvTransportData) {
        try {
            console.log('%c[MEDIA] Создание транспортов...', 'color: blue');
            
            // Сохраняем ID транспортов из полученных данных
            client.sendTransportId = sendTransportData.id;
            client.recvTransportId = recvTransportData.id;

            // Создаем sendTransport с параметрами из сервера
            client.sendTransport = client.device.createSendTransport({
                id: sendTransportData.id,
                iceParameters: sendTransportData.iceParameters,
                iceCandidates: sendTransportData.iceCandidates,
                dtlsParameters: sendTransportData.dtlsParameters,
                appData: { clientId: client.clientID }
            });
            
            // Обработчик connect для sendTransport
            client.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                console.log('%c[MEDIA] [sendTransport] Событие connect', 'color: orange');
                
                try {
                    const response = await fetch(`${client.mediaData.mediaServerUrl}/api/transport/connect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            transportId: client.sendTransportId,
                            dtlsParameters
                        })
                    });
                    
                    if (!response.ok) {
                        const errText = await response.text();
                        return errback(new Error(`HTTP ${response.status}: ${errText}`));
                    }
                    
                    console.log('%c[MEDIA] [sendTransport] Успешно подключён', 'color: green');
                    callback();
                } catch (error) {
                    console.error('%c[MEDIA] [sendTransport] Ошибка подключения:', 'color: red', error);
                    errback(error);
                }
            });
            
            // Обработчик produce для sendTransport
            client.sendTransport.on('produce', async (parameters, callback, errback) => {
                console.log('%c[MEDIA] [sendTransport] Событие produce', 'color: orange');
                
                try {
                    const response = await fetch(`${client.mediaData.mediaServerUrl}/api/produce`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            transportId: client.sendTransportId,
                            kind: parameters.kind,
                            rtpParameters: parameters.rtpParameters
                        })
                    });
                    
                    if (!response.ok) {
                        const errText = await response.text();
                        return errback(new Error(`HTTP ${response.status}: ${errText}`));
                    }
                    
                    const data = await response.json();
                    console.log('%c[MEDIA] [sendTransport] Продюсер создан, ID:', 'color: green', data.producerId);
                    callback({ id: data.producerId });
                } catch (error) {
                    console.error('%c[MEDIA] [sendTransport] Ошибка создания продюсера:', 'color: red', error);
                    errback(error);
                }
            });
            
            // Создаем recvTransport с параметрами из сервера
            client.recvTransport = client.device.createRecvTransport({
                id: recvTransportData.id,
                iceParameters: recvTransportData.iceParameters,
                iceCandidates: recvTransportData.iceCandidates,
                dtlsParameters: recvTransportData.dtlsParameters,
                appData: { clientId: client.clientID }
            });
            
            // Обработчик connect для recvTransport
            client.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                console.log('%c[MEDIA] [recvTransport] Событие connect', 'color: orange');
                
                try {
                    const response = await fetch(`${client.mediaData.mediaServerUrl}/api/transport/connect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            transportId: client.recvTransportId,
                            dtlsParameters
                        })
                    });
                    
                    if (!response.ok) {
                        const errText = await response.text();
                        return errback(new Error(`HTTP ${response.status}: ${errText}`));
                    }
                    
                    console.log('%c[MEDIA] [recvTransport] Успешно подключён', 'color: green');
                    callback();
                } catch (error) {
                    console.error('%c[MEDIA] [recvTransport] Ошибка подключения:', 'color: red', error);
                    errback(error);
                }
            });
            
            console.log('%c[MEDIA] Транспорты созданы', 'color: green');
        } catch (error) {
            console.error('%c[MEDIA] Ошибка создания транспортов:', 'color: red', error);
            throw error;
        }
    }

    static async startMicrophone(client) {
        try {
            console.log('%c[MEDIA] Запрос доступа к микрофону...', 'color: blue');
            
            client.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000,
                    channelCount: 2
                }
            });
            
            const track = client.stream.getAudioTracks()[0];
            const encodings = [{
                maxBitrate: client.bitrate,
                dtx: client.dtxEnabled
            }];
            
            client.audioProducer = await client.sendTransport.produce({
                track,
                encodings,
                appData: { 
                    clientID: client.clientID,
                    roomId: client.currentRoom
                }
            });
            
            client.ownProducerId = client.audioProducer.id;
            console.log('%c[MEDIA] Создан audioProducer, ID:', 'color: green', client.audioProducer.id);
            
            client.isMicActive = true;
            MediaManager.updateMicUI(client, true);
            client.addMessage('System', 'Микрофон включен');
        } catch (error) {
            console.error('%c[MEDIA] Ошибка включения микрофона:', 'color: red', error);
            client.addMessage('System', 'Ошибка микрофона');
            client.updateStatus('Ошибка микрофона', 'disconnected');
            throw error;
        }
    }

    static async stopMicrophone(client) {
        try {
            if (client.audioProducer) {
                client.audioProducer.close();
                client.audioProducer = null;
            }
            
            if (client.stream) {
                client.stream.getTracks().forEach(t => t.stop());
                client.stream = null;
            }
            
            client.isMicActive = false;
            MediaManager.updateMicUI(client, false);
            client.addMessage('System', 'Микрофон выключен');
        } catch (error) {
            console.error('%c[MEDIA] Ошибка выключения микрофона:', 'color: red', error);
        }
    }

    static updateMicUI(client, active) {
        if (client.micButton) client.micButton.classList.toggle('active', active);
        if (client.micButtonText) client.micButtonText.textContent = active ? 'Выключить микрофон' : 'Включить микрофон';
        if (client.selfStatus) client.selfStatus.className = 'member-status ' + (active ? 'active' : '');
        client.updateMobileMicButtonColor();
    }

    static startListeningForProducers(client) {
        if (client.producerCheckInterval) {
            clearInterval(client.producerCheckInterval);
        }
        
        client.producerCheckInterval = setInterval(async () => {
            try {
                if (!client.isConnected) return;
                
                console.log('%c[MEDIA] Проверка продюсеров на сервере...', 'color: blue');
                const response = await fetch(`${client.mediaData.mediaServerUrl}/api/client/${client.clientID}/producers`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('%c[MEDIA] Получены producerId:', 'color: green', data.producers);
                    
                    if (client.startConsuming && typeof client.startConsuming === 'function') {
                        client.startConsuming();
                    }
                }
            } catch (error) {
                console.error('%c[MEDIA] Ошибка проверки продюсеров:', 'color: red', error);
            }
        }, 10000);
    }

    static startKeepAlive(client, roomId) {
        if (client.keepAliveInterval) {
            clearInterval(client.keepAliveInterval);
        }
        
        // Первый keep-alive сразу после подключения
        MediaManager.sendKeepAlive(client, roomId);
        
        // Затем каждые 10 секунд
        client.keepAliveInterval = setInterval(() => {
            MediaManager.sendKeepAlive(client, roomId);
        }, 10000);
        
        console.log('%c[MEDIA] Keep-alive запущен (10 секунд)', 'color: green');
    }

    static async sendKeepAlive(client, roomId) {
        try {
            if (!client.isConnected || !client.mediaData) {
                console.log('%c[MEDIA] Пропускаем keep-alive: соединение неактивно', 'color: orange');
                return;
            }
            
            console.log('%c[MEDIA] Отправка keep-alive запроса...', 'color: blue');
            const response = await fetch(`${client.mediaData.mediaServerUrl}/api/health`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: client.clientID,
                    roomId: roomId
                })
            });
            
            console.log('%c[MEDIA] Ответ keep-alive, статус:', 'color: blue', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('%c[MEDIA] Keep-alive запрос успешен:', 'color: green', data);
            } else {
                const errorText = await response.text();
                console.error('%c[MEDIA] Keep-alive запрос неуспешен:', 'color: red', response.status, errorText);
            }
        } catch (error) {
            console.error('%c[MEDIA] Ошибка keep-alive:', 'color: red', error);
        }
    }
}
