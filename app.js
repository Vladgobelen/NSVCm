class VoiceChatClient {
    constructor() {
        this.API_SERVER_URL = 'https://ns.fiber-gate.ru';
        this.MEDIA_SERVER_URL = 'https://ns.fiber-gate.ru';
        this.CHAT_API_URL = `${this.API_SERVER_URL}/api/chat/join`;

        this.device = null;
        this.clientID = this.generateClientID();
        this.sendTransport = null;
        this.recvTransport = null;
        this.audioProducer = null;
        this.consumers = new Map();
        this.stream = null;
        this.isMicActive = false;
        this.isConnected = false;
        this.currentRoom = 'general';
        this.keepAliveInterval = null;
        this.updateInterval = null;
        this.bitrate = 32000;
        this.dtxEnabled = true;
        this.fecEnabled = true;
        this.isConnecting = false;
        this.socket = null;
        this.ownProducerId = null;

        window.voiceChatClient = this;

        // === Основные элементы ===
        this.micButton = document.getElementById('micButton');
        this.micButtonText = document.getElementById('micButtonText');
        this.statusText = document.getElementById('statusText');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.messageInput = document.getElementById('messageInput');
        this.systemTime = document.getElementById('systemTime');
        this.roomItems = document.querySelectorAll('.room-item');
        this.currentRoomTitle = document.getElementById('currentRoomTitle');
        this.mobileMicBtn = document.getElementById('mobileMicBtn');

        // === Панели ===
        this.serverSelectorPanel = document.getElementById('serverSelectorPanel');
        this.roomSelectorPanel = document.getElementById('roomSelectorPanel');
        this.membersPanel = document.getElementById('membersPanel');
        this.membersPanelDesktop = document.getElementById('membersPanelDesktop');
        this.settingsModal = document.getElementById('settingsModal');

        // === Кнопки ===
        this.openServerSelectorBtn = document.getElementById('openServerSelectorBtn');
        this.openServerBtnMobile = document.getElementById('openServerBtnMobile');
        this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
        this.openSettingsBtn = document.getElementById('openSettingsBtn');
        this.openSettingsBtnMobile = document.getElementById('openSettingsBtnMobile');
        this.closeSettingsModal = document.getElementById('closeSettingsModal');
        this.closeServerPanelBtn = document.getElementById('closeServerPanelBtn');
        this.closeRoomPanelBtn = document.getElementById('closeRoomPanelBtn');
        this.closeMembersPanelBtn = document.getElementById('closeMembersPanelBtn');
        this.addServerBtn = document.getElementById('addServerBtn');
        this.toggleMembersBtn = document.getElementById('toggleMembersBtn');

        // === Настройки ===
        this.bitrateSlider = document.getElementById('bitrateSlider');
        this.bitrateValue = document.getElementById('bitrateValue');
        this.dtxCheckbox = document.getElementById('dtxCheckbox');
        this.fecCheckbox = document.getElementById('fecCheckbox');
        this.applySettingsBtn = document.getElementById('applySettingsBtn');

        // === Участники ===
        this.membersList = document.getElementById('membersList');
        this.membersCount = document.getElementById('membersCount');
        this.selfStatus = document.getElementById('selfStatus');
        this.membersListDesktop = document.getElementById('membersListDesktop');
        this.membersCountDesktop = document.getElementById('membersCountDesktop');
        this.selfStatusDesktop = document.getElementById('selfStatusDesktop');

        // === Чат ===
        this.messagesContainer = document.getElementById('messagesContainer');

        // === Инициализация UI ===
        [this.serverSelectorPanel, this.roomSelectorPanel, this.membersPanel].forEach(panel => {
            if (panel) {
                panel.style.display = 'none';
                panel.classList.remove('visible');
            }
        });
        this.settingsModal.style.display = 'none';

        this.updateSystemTime();
        setInterval(() => this.updateSystemTime(), 60000);

        // === Обработчики событий ===
        if (this.messageInput) {
            this.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });
        }

        this.roomItems.forEach(item => {
            item.addEventListener('click', () => {
                this.roomItems.forEach(r => r.classList.remove('active'));
                item.classList.add('active');
                const roomId = item.dataset.room;
                const roomName = this.getRoomName(roomId);
                this.currentRoomTitle.textContent = roomName;
                this.closePanel(this.roomSelectorPanel);
                this.reconnectToRoom(roomId);
            });
        });

        if (this.mobileMicBtn) {
            this.mobileMicBtn.onclick = null;
            this.mobileMicBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.isConnected) {
                    this.autoConnect();
                } else {
                    this.toggleMicrophone();
                }
            });
            this.updateMobileMicButtonColor();
        }

        if (this.micButton) {
            this.micButton.disabled = true;
            this.micButton.onclick = () => this.toggleMicrophone();
        }

        if (this.micButtonText) {
            this.micButtonText.textContent = 'Включить микрофон';
        }

        [this.openSettingsBtn, this.openSettingsBtnMobile].forEach(btn => {
            if (btn) btn.addEventListener('click', () => this.openSettings());
        });

        if (this.closeSettingsModal) {
            this.closeSettingsModal.addEventListener('click', () => this.settingsModal.style.display = 'none');
        }

        if (this.bitrateSlider) {
            this.bitrateSlider.addEventListener('input', () => {
                this.bitrateValue.textContent = this.bitrateSlider.value;
            });
        }

        if (this.applySettingsBtn) {
            this.applySettingsBtn.addEventListener('click', () => this.applySettings());
        }

        window.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.settingsModal.style.display = 'none';
            }
        });

        [this.openServerSelectorBtn, this.openServerBtnMobile].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openPanel(this.serverSelectorPanel);
                });
            }
        });

        if (this.closeServerPanelBtn) {
            this.closeServerPanelBtn.addEventListener('click', () => this.closePanel(this.serverSelectorPanel));
        }

        if (this.toggleSidebarBtn) {
            this.toggleSidebarBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openPanel(this.roomSelectorPanel);
            });
        }

        if (this.closeRoomPanelBtn) {
            this.closeRoomPanelBtn.addEventListener('click', () => this.closePanel(this.roomSelectorPanel));
        }

        if (this.toggleMembersBtn) {
            this.toggleMembersBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openPanel(this.membersPanel);
            });
        }

        if (this.closeMembersPanelBtn) {
            this.closeMembersPanelBtn.addEventListener('click', () => this.closePanel(this.membersPanel));
        }

        document.addEventListener('click', (e) => {
            [this.serverSelectorPanel, this.roomSelectorPanel, this.membersPanel].forEach(panel => {
                if (panel && panel.classList.contains('visible') && !panel.contains(e.target)) {
                    this.closePanel(panel);
                }
            });
        });

        [this.serverSelectorPanel, this.roomSelectorPanel, this.membersPanel].forEach(panel => {
            if (panel) panel.addEventListener('click', (e) => e.stopPropagation());
        });

        this.addServerBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            alert('Добавление сервера (заглушка)');
        });

        document.addEventListener('click', function unlockAudio() {
            const tempAudio = new Audio();
            tempAudio.play().then(() => {
                console.log("[AUDIO] Воспроизведение аудио разблокировано пользовательским жестом");
                tempAudio.remove();
            }).catch(e => {
                console.log("[AUDIO] Не удалось разблокировать воспроизведение:", e);
            });
            document.removeEventListener('click', unlockAudio);
        }, { once: true });

        this.autoConnect();
    }

    getRoomName(roomId) {
        const rooms = {
            'general': 'Общий голосовой канал',
            'music': 'Музыкальная комната',
            'conference': 'Конференция'
        };
        return rooms[roomId] || roomId;
    }

    generateClientID() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    updateStatus(message, type = 'normal') {
        if (this.statusText) this.statusText.textContent = message;
        if (this.statusIndicator) {
            this.statusIndicator.className = 'status-indicator';
            if (type === 'connecting') this.statusIndicator.classList.add('connecting');
            else if (type === 'disconnected') this.statusIndicator.classList.add('disconnected');
        }
        console.log('[STATUS]', message);
    }

    updateSystemTime() {
        if (this.systemTime) {
            const now = new Date();
            this.systemTime.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        }
    }

    addMessage(username, text, time = null) {
        if (!this.messagesContainer) return;
        const now = new Date();
        const timeString = time || `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        const avatarText = username === 'Вы' ? 'Вы' : username.charAt(0).toUpperCase();
        messageElement.innerHTML = `
            <div class="message-avatar">${avatarText}</div>
            <div class="message-content">
                <div class="message-header">
                    <div class="message-username">${username}</div>
                    <div class="message-time">${timeString}</div>
                </div>
                <div class="message-text">${text}</div>
            </div>
        `;
        this.messagesContainer.appendChild(messageElement);
        setTimeout(() => messageElement.classList.add('appeared'), 10);
        const wrapper = this.messagesContainer.parentElement;
        if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
    }

    sendMessage() {
        if (!this.messageInput || !this.socket) return;
        const text = this.messageInput.value.trim();
        if (text) {
            this.socket.emit('send-message', {
                text,
                clientId: this.clientID
            });
            this.messageInput.value = '';
        }
    }

    async autoConnect() {
        if (this.isConnecting || this.isConnected) return;
        this.isConnecting = true;
        this.updateStatus('Подключение к серверу...', 'connecting');
        try {
            await this.joinRoom(this.currentRoom);
        } catch (error) {
            this.updateStatus('Ошибка: ' + error.message, 'disconnected');
            console.error('[AUTO CONNECT ERROR]', error);
        } finally {
            this.isConnecting = false;
        }
    }

    async reconnectToRoom(roomId) {
        this.currentRoom = roomId;
        this.disconnectFromMedia();
        this.destroySocket();
        await this.autoConnect();
    }

    async joinRoom(roomId) {
        this.updateStatus('Вход в комнату...', 'connecting');

        try {
            const response = await fetch(this.CHAT_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId,
                    username: 'Пользователь',
                    clientId: this.clientID
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            this.clientID = data.clientId;
            this.MEDIA_SERVER_URL = (data.mediaServerUrl || 'https://ns.fiber-gate.ru').trim();

            this.connectToChatSocket();
            await this.connectToMediaServer(roomId);

        } catch (error) {
            this.updateStatus('Ошибка: ' + error.message, 'disconnected');
            console.error('[JOIN ROOM ERROR]', error);
            throw error;
        }
    }

    connectToChatSocket() {
        this.socket = io(this.API_SERVER_URL);

        this.socket.on('connect', () => {
            console.log('🟢 Подключено к чату');
            this.socket.emit('join-room', {
                roomId: this.currentRoom,
                clientId: this.clientID
            });
        });

        this.socket.on('messages', (data) => {
            data.messages.forEach(msg => this.addMessage(msg.user, msg.text, msg.time));
        });

        this.socket.on('new-message', (message) => {
            this.addMessage(message.user, message.text, message.time);
        });

        this.socket.on('user-joined', (data) => {
            this.addMessage('System', `${data.username} присоединился`);
        });

        this.socket.on('user-left', (data) => {
            this.addMessage('System', 'Пользователь покинул комнату');
        });

        this.socket.on('participants', (data) => {
            this.updateMembersList(data.clients);
            this.updateMembersListDesktop(data.clients);
        });
    }

    destroySocket() {
        if (this.socket) {
            this.socket.emit('leave-room');
            this.socket.disconnect();
            this.socket = null;
        }
    }

    async connectToMediaServer(roomId) {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    echoCancellationType: 'system'
                },
                video: false
            });

            await this.registerClient(roomId);
            this.startKeepAlive(roomId);

            const rtpCapabilities = await this.getRtpCapabilities(roomId);
            this.device = new mediasoupClient.Device();
            await this.device.load({ routerRtpCapabilities: rtpCapabilities });

            await this.createTransports(roomId);

            this.isConnected = true;
            this.updateStatus('Готов', 'normal');
            if (this.micButton) {
                this.micButton.disabled = false;
                this.micButton.onclick = () => this.toggleMicrophone();
            }
            if (this.messageInput) {
                this.messageInput.disabled = false;
            }

            if (this.micButtonText) {
                this.micButtonText.textContent = 'Включить микрофон';
            }

            this.addMessage('System', 'Вы подключены. Нажмите кнопку, чтобы включить микрофон.');
            this.updateMobileMicButtonColor();

        } catch (error) {
            this.updateStatus('Ошибка: ' + error.message, 'disconnected');
            if (this.micButton) this.micButton.disabled = false;
            this.updateMobileMicButtonColor();
            console.error('[MEDIA CONNECT ERROR]', error);
        } finally {
            this.isConnecting = false;
        }
    }

    async registerClient(roomId) {
        await fetch(`${this.MEDIA_SERVER_URL}/api/client/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientID: this.clientID, roomId })
        });
    }

    startKeepAlive(roomId) {
        this.keepAliveInterval = setInterval(async () => {
            try {
                await this.registerClient(roomId);
            } catch (e) { console.log('[KEEP ALIVE]', e); }
        }, 5000);
    }

    async getRtpCapabilities(roomId) {
        const res = await fetch(`${this.MEDIA_SERVER_URL}/api/rtp-capabilities/${roomId}`);
        return res.json();
    }

    async createTransports(roomId) {
        const send = await this.createTransport('send', roomId);
        this.sendTransport = this.device.createSendTransport(send);
        this.setupSendTransport();

        const recv = await this.createTransport('recv', roomId);
        this.recvTransport = this.device.createRecvTransport(recv);
        this.setupRecvTransport();

        this.startParticipantUpdates();
    }

    async createTransport(direction, roomId) {
        const res = await fetch(`${this.MEDIA_SERVER_URL}/api/transport/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Client-ID': this.clientID },
            body: JSON.stringify({ clientID: this.clientID, direction, roomId })
        });
        const data = await res.json();
        return {
            id: data.transportId,
            iceParameters: data.iceParameters,
            iceCandidates: data.iceCandidates,
            dtlsParameters: data.dtlsParameters
        };
    }

    setupSendTransport() {
        this.sendTransport.on('connect', async (data, callback, errback) => {
            try {
                await fetch(`${this.MEDIA_SERVER_URL}/api/transport/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Client-ID': this.clientID },
                    body: JSON.stringify({
                        transportId: this.sendTransport.id,
                        dtlsParameters: data.dtlsParameters
                    })
                });
                callback();
            } catch (e) { errback(e); }
        });

        this.sendTransport.on('produce', async (data, callback, errback) => {
            try {
                const res = await fetch(`${this.MEDIA_SERVER_URL}/api/produce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Client-ID': this.clientID },
                    body: JSON.stringify({
                        transportId: this.sendTransport.id,
                        kind: data.kind,
                        rtpParameters: data.rtpParameters
                    })
                });
                const json = await res.json();
                this.ownProducerId = json.producerId;
                callback({ id: json.producerId });
            } catch (e) { errback(e); }
        });
    }

    setupRecvTransport() {
        this.recvTransport.on('connect', async (data, callback, errback) => {
            try {
                await fetch(`${this.MEDIA_SERVER_URL}/api/transport/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Client-ID': this.clientID },
                    body: JSON.stringify({
                        transportId: this.recvTransport.id,
                        dtlsParameters: data.dtlsParameters
                    })
                });
                callback();
            } catch (e) { errback(e); }
        });
    }

    updateMobileMicButtonColor() {
        if (!this.mobileMicBtn) return;
        if (!this.isConnected) {
            this.mobileMicBtn.style.backgroundColor = '#2f3136';
            this.mobileMicBtn.style.color = '#b9bbbe';
        } else if (this.isMicActive) {
            this.mobileMicBtn.style.backgroundColor = '#3ba55d';
            this.mobileMicBtn.style.color = '#ffffff';
        } else {
            this.mobileMicBtn.style.backgroundColor = '#ed4245';
            this.mobileMicBtn.style.color = '#ffffff';
        }
    }

    async toggleMicrophone() {
        try {
            this.isMicActive ? await this.stopMicrophone() : await this.startMicrophone();
        } catch (error) {
            console.error('Ошибка при переключении микрофона:', error);
        }
    }

    async startMicrophone() {
        if (this.isMicActive) return;
        try {
            let track = this.stream?.getAudioTracks()[0];

            if (!track || track.readyState === 'ended') {
                console.warn('[MIC] Трек не существует или завершен. Получаем новый поток.');
                this.stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        echoCancellationType: 'system'
                    },
                    video: false
                });
                track = this.stream.getAudioTracks()[0];
                console.log('[MIC] Новый поток успешно получен.');
            }

            const encodings = [{ maxBitrate: this.bitrate, dtx: this.dtxEnabled, fec: this.fecEnabled }];
            this.audioProducer = await this.sendTransport.produce({ track, encodings });

            if (this.audioProducer) {
                this.ownProducerId = this.audioProducer.id;
            }

            this.isMicActive = true;
            if (this.micButton) this.micButton.classList.add('active');
            if (this.micButtonText) this.micButtonText.textContent = 'Выключить микрофон';
            if (this.selfStatus) this.selfStatus.className = 'member-status active';
            if (this.selfStatusDesktop) this.selfStatusDesktop.className = 'member-status active';
            this.updateStatus('Микрофон включен', 'normal');
            this.addMessage('System', `Микрофон включён (битрейт: ${this.bitrate/1000} кбит/с)`);
            this.updateMobileMicButtonColor();

        } catch (error) {
            this.updateStatus('Ошибка микрофона: ' + error.message, 'disconnected');
            console.error('[MIC ERROR]', error);
            
            this.isMicActive = false;
            if (this.audioProducer) {
                this.audioProducer.close().catch(e => console.error('[MIC] Ошибка при закрытии producer:', e));
                this.audioProducer = null;
            }
            if (this.micButton) this.micButton.classList.remove('active');
            if (this.micButtonText) this.micButtonText.textContent = 'Включить микрофон';
            if (this.selfStatus) this.selfStatus.className = 'member-status muted';
            if (this.selfStatusDesktop) this.selfStatusDesktop.className = 'member-status muted';
            this.updateMobileMicButtonColor();
        }
    }

    async stopMicrophone() {
        if (!this.isMicActive || !this.audioProducer) return;
        try {
            await fetch(`${this.MEDIA_SERVER_URL}/api/producer/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-ID': this.clientID },
                body: JSON.stringify({ producerId: this.audioProducer.id })
            });
            this.audioProducer.close();
            this.audioProducer = null;
            this.ownProducerId = null;
        } catch (e) { 
            console.error('[CLOSE PRODUCER]', e); 
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                if (track.readyState !== 'ended') {
                    track.stop();
                }
            });
        }

        this.isMicActive = false;
        if (this.micButton) this.micButton.classList.remove('active');
        if (this.micButtonText) this.micButtonText.textContent = 'Включить микрофон';
        if (this.selfStatus) this.selfStatus.className = 'member-status muted';
        if (this.selfStatusDesktop) this.selfStatusDesktop.className = 'member-status muted';
        this.updateStatus('Микрофон выключен', 'normal');
        this.addMessage('System', 'Микрофон выключен');
        this.updateMobileMicButtonColor();
    }

    async updateParticipants() {
        try {
            const res = await fetch(`${this.MEDIA_SERVER_URL}/api/clients?clientID=${this.clientID}`);
            const data = await res.json();
            const otherClients = data.clients.filter(id => id !== this.clientID);
            for (const id of otherClients) {
                await this.consumeClientProducers(id);
            }
        } catch (e) { console.error('[UPDATE PARTICIPANTS]', e); }
    }

    startParticipantUpdates() {
        this.updateInterval = setInterval(() => this.updateParticipants(), 3000);
    }

    async consumeClientProducers(clientId) {
        if (clientId === this.clientID) {
            return;
        }

        try {
            const res = await fetch(`${this.MEDIA_SERVER_URL}/api/client/${clientId}/producers?clientID=${this.clientID}`);
            const data = await res.json();
            
            const producersToConsume = data.producers.filter(pid => pid !== this.ownProducerId);
            
            for (const pid of producersToConsume) {
                if (!this.consumers.has(pid)) {
                    await this.consumeProducer(pid, clientId);
                }
            }
        } catch (e) { console.error('[CONSUME CLIENT]', e); }
    }

    async consumeProducer(producerId, clientId) {
        if (producerId === this.ownProducerId) {
            return;
        }
        
        try {
            const res = await fetch(`${this.MEDIA_SERVER_URL}/api/consume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Client-ID': this.clientID },
                body: JSON.stringify({
                    producerId,
                    rtpCapabilities: this.device.rtpCapabilities,
                    transportId: this.recvTransport.id
                })
            });

            const data = await res.json();

            console.log(`[DEBUG] Попытка потребить producerId=${producerId} от клиента=${clientId}`);
            console.log(`[DEBUG] Ответ от /api/consume (статус ${res.status}):`, data);

            if (!res.ok) {
                 console.warn(`[CONSUME] Сервер вернул HTTP ошибку ${res.status} для producerId=${producerId}`);
                 if (data && data.error) {
                      console.warn(`[CONSUME] Сообщение от сервера: ${data.error}`);
                 }
                 return;
            }

            if (data && data.error) {
                console.warn(`[CONSUME] Предупреждение от сервера для producerId=${producerId}: ${data.error}`);
                return; 
            }
            
            if (!data || !data.id) {
                console.error(`[CONSUME] ОШИБКА: Сервер вернул некорректный успешный ответ. Отсутствует 'id' для producerId=${producerId}. Ответ:`, data);
                return;
            }

            const consumer = await this.recvTransport.consume(data);
            this.consumers.set(producerId, consumer);
            this.playAudio(consumer.track, clientId, producerId);
        } catch (e) { 
            console.error('[CONSUME] Ошибка сети или при обработке:', e); 
        }
    }

    playAudio(track, clientId, producerId) {
        const stream = new MediaStream([track]);
        const el = document.createElement('audio');
        el.srcObject = stream;
        el.volume = 0.8;
        el.style.display = 'none';
        el.setAttribute('data-client-id', clientId);
        el.setAttribute('data-producer-id', producerId);
        document.body.appendChild(el);
        
        el.play()
            .then(() => {
                console.log(`[AUDIO] Воспроизведение начато для клиента ${clientId}, producer ${producerId}`);
            })
            .catch(e => {
                console.error(`[AUDIO] Ошибка воспроизведения для клиента ${clientId}, producer ${producerId}:`, e);
                if (e.name === 'NotAllowedError') {
                     this.addMessage('System', 'Ошибка: Браузер блокирует автоматическое воспроизведение аудио. Кликните в любом месте страницы, чтобы разблокировать.');
                }
            });
        
        if (!window.audioElements) window.audioElements = new Map();
        window.audioElements.set(producerId, el);
    }

    openSettings() {
        if (this.bitrateSlider && this.dtxCheckbox && this.fecCheckbox && this.settingsModal) {
            this.bitrateSlider.value = this.bitrate / 1000;
            this.bitrateValue.textContent = this.bitrateSlider.value;
            this.dtxCheckbox.checked = this.dtxEnabled;
            this.fecCheckbox.checked = this.fecEnabled;
            this.settingsModal.style.display = 'block';
        }
    }

    async applySettings() {
        const newBitrate = parseInt(this.bitrateSlider.value) * 1000;
        const newDtx = this.dtxCheckbox.checked;
        const newFec = this.fecCheckbox.checked;

        this.bitrate = newBitrate;
        this.dtxEnabled = newDtx;
        this.fecEnabled = newFec;

        if (this.isMicActive) {
            await this.stopMicrophone();
            await this.startMicrophone();
            this.addMessage('System', 'Настройки применены и микрофон перезапущен.');
        } else {
            this.addMessage('System', 'Настройки сохранены.');
        }

        this.settingsModal.style.display = 'none';
    }

    updateMembersList(clients) {
        if (!this.membersList || !this.membersCount) return;
        const others = clients.filter(id => id !== this.clientID);
        this.membersCount.textContent = others.length + 1;
        let html = `
            <div class="member-item">
                <div class="member-avatar">Вы</div>
                <div class="member-name">Вы</div>
                <div class="member-status ${this.isMicActive ? 'active' : 'muted'}" id="selfStatus"></div>
            </div>
        `;
        others.forEach(id => {
            const short = id.substring(0, 6);
            html += `
                <div class="member-item">
                    <div class="member-avatar">${short[0].toUpperCase()}</div>
                    <div class="member-name">${short}</div>
                    <div class="member-status"></div>
                </div>
            `;
        });
        this.membersList.innerHTML = html;
        this.selfStatus = document.getElementById('selfStatus');
    }

    updateMembersListDesktop(clients) {
        if (!this.membersListDesktop || !this.membersCountDesktop) return;
        const others = clients.filter(id => id !== this.clientID);
        this.membersCountDesktop.textContent = others.length + 1;
        let html = `
            <div class="member-item">
                <div class="member-avatar">Вы</div>
                <div class
            <div class="member-item">
                <div class="member-avatar">Вы</div>
                <div class="member-name">Вы</div>
                <div class="member-status ${this.isMicActive ? 'active' : 'muted'}" id="selfStatusDesktop"></div>
            </div>
        `;
        others.forEach(id => {
            const short = id.substring(0, 6);
            html += `
                <div class="member-item">
                    <div class="member-avatar">${short[0].toUpperCase()}</div>
                    <div class="member-name">${short}</div>
                    <div class="member-status"></div>
                </div>
            `;
        });
        this.membersListDesktop.innerHTML = html;
        this.selfStatusDesktop = document.getElementById('selfStatusDesktop');
    }

    openPanel(panel) {
        if (panel) {
            panel.classList.add('visible');
            panel.style.display = 'flex';
        }
    }

    closePanel(panel) {
        if (panel) {
            panel.classList.remove('visible');
            setTimeout(() => {
                if (!panel.classList.contains('visible')) panel.style.display = 'none';
            }, 300);
        }
    }

    disconnectFromMedia() {
        this.isConnected = false;
        this.isMicActive = false;
        if (this.micButton) this.micButton.classList.remove('active');
        if (this.selfStatus) this.selfStatus.className = 'member-status muted';
        if (this.selfStatusDesktop) this.selfStatusDesktop.className = 'member-status muted';
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.audioProducer) this.audioProducer.close();
        this.consumers.forEach(consumer => {
            if (consumer && typeof consumer.close === 'function') {
                consumer.close();
            }
        });
        this.consumers.clear();
        if (this.sendTransport) this.sendTransport.close();
        if (this.recvTransport) this.recvTransport.close();
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                if (track.readyState !== 'ended') {
                    track.stop();
                }
            });
        }
        if (window.audioElements) {
            window.audioElements.forEach(el => {
                if (el && el.parentNode) {
                    el.remove();
                }
            });
            window.audioElements.clear();
        }
    }

    destroy() {
        this.disconnectFromMedia();
        this.destroySocket();
    }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    if (typeof mediasoupClient === 'undefined') {
        const s = document.getElementById('statusText');
        const i = document.getElementById('statusIndicator');
        if (s) s.textContent = 'Ошибка: mediasoup-client не загружен';
        if (i) i.className = 'status-indicator disconnected';
        return;
    }
    if (typeof io === 'undefined') {
        console.warn('Socket.IO не загружен. Чат не будет работать.');
        return;
    }
    new VoiceChatClient();
});

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    if (window.voiceChatClient) window.voiceChatClient.destroy();
});
