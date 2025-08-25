class VoiceChatClient {
    constructor() {
        this.SERVER_URL = 'https://ns.fiber-gate.ru';
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
        window.voiceChatClient = this;

        // Основные элементы
        this.micButton = document.getElementById('micButton');
        this.micButtonText = document.getElementById('micButtonText');
        this.statusText = document.getElementById('statusText');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.messageInput = document.getElementById('messageInput');
        this.systemTime = document.getElementById('systemTime');
        this.roomItems = document.querySelectorAll('.room-item');
        this.currentRoomTitle = document.getElementById('currentRoomTitle');
        this.mobileMicBtn = document.getElementById('mobileMicBtn');

        // Панели
        this.serverSelectorPanel = document.getElementById('serverSelectorPanel');
        this.roomSelectorPanel = document.getElementById('roomSelectorPanel');
        this.membersPanel = document.getElementById('membersPanel');
        this.membersPanelDesktop = document.getElementById('membersPanelDesktop');
        this.settingsModal = document.getElementById('settingsModal');

        // Кнопки
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

        // Настройки
        this.bitrateSlider = document.getElementById('bitrateSlider');
        this.bitrateValue = document.getElementById('bitrateValue');
        this.dtxCheckbox = document.getElementById('dtxCheckbox');
        this.fecCheckbox = document.getElementById('fecCheckbox');
        this.applySettingsBtn = document.getElementById('applySettingsBtn');

        // Участники
        this.membersList = document.getElementById('membersList');
        this.membersCount = document.getElementById('membersCount');
        this.selfStatus = document.getElementById('selfStatus');

        // Десктопная панель участников
        this.membersListDesktop = document.getElementById('membersListDesktop');
        this.membersCountDesktop = document.getElementById('membersCountDesktop');
        this.selfStatusDesktop = document.getElementById('selfStatusDesktop');

        // Чат
        this.messagesContainer = document.getElementById('messagesContainer');

        // Инициализация панелей
        [this.serverSelectorPanel, this.roomSelectorPanel, this.membersPanel].forEach(panel => {
            if (panel) {
                panel.style.display = 'none';
                panel.classList.remove('visible');
            }
        });
        this.settingsModal.style.display = 'none';

        // Обновление времени
        this.updateSystemTime();
        setInterval(() => this.updateSystemTime(), 60000);

        // Обработчики событий
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Кнопки комнат
        this.roomItems.forEach(item => {
            item.addEventListener('click', () => {
                this.roomItems.forEach(r => r.classList.remove('active'));
                item.classList.add('active');
                this.currentRoom = item.dataset.room;
                const roomName = this.getRoomName(this.currentRoom);
                this.currentRoomTitle.textContent = roomName;
                this.addMessage('System', `Вы вошли в комнату: ${roomName}`);
                this.closePanel(this.roomSelectorPanel);
            });
        });

        // Мобильная кнопка микрофона
        if (this.mobileMicBtn) {
            this.mobileMicBtn.addEventListener('click', () => {
                if (this.isConnected) {
                    this.toggleMicrophone();
                } else if (!this.micButton.disabled) {
                    this.autoConnect();
                }
            });
        }

        // Настройки
        [this.openSettingsBtn, this.openSettingsBtnMobile].forEach(btn => {
            btn?.addEventListener('click', () => this.openSettings());
        });
        this.closeSettingsModal.addEventListener('click', () => this.settingsModal.style.display = 'none');
        this.bitrateSlider.addEventListener('input', () => {
            this.bitrateValue.textContent = this.bitrateSlider.value;
        });
        this.applySettingsBtn.addEventListener('click', () => this.applySettings());
        window.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.settingsModal.style.display = 'none';
            }
        });

        // Панель серверов
        [this.openServerSelectorBtn, this.openServerBtnMobile].forEach(btn => {
            btn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openPanel(this.serverSelectorPanel);
            });
        });
        this.closeServerPanelBtn.addEventListener('click', () => this.closePanel(this.serverSelectorPanel));

        // Панель комнат
        this.toggleSidebarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openPanel(this.roomSelectorPanel);
        });
        this.closeRoomPanelBtn.addEventListener('click', () => this.closePanel(this.roomSelectorPanel));

        // Панель участников (мобильная)
        this.toggleMembersBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openPanel(this.membersPanel);
        });
        this.closeMembersPanelBtn.addEventListener('click', () => this.closePanel(this.membersPanel));

        // Закрытие панелей кликом вне
        document.addEventListener('click', (e) => {
            [this.serverSelectorPanel, this.roomSelectorPanel, this.membersPanel].forEach(panel => {
                if (panel && panel.classList.contains('visible') && !panel.contains(e.target)) {
                    this.closePanel(panel);
                }
            });
        });

        // Закрытие панели по клику внутри
        [this.serverSelectorPanel, this.roomSelectorPanel, this.membersPanel].forEach(panel => {
            panel?.addEventListener('click', (e) => e.stopPropagation());
        });

        // Добавление сервера
        this.addServerBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            alert('Добавление сервера (заглушка)');
        });

        document.querySelectorAll('.saved-server-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const serverId = e.currentTarget.dataset.serverId;
                alert(`Выбран сервер: ${serverId}`);
                this.closePanel(this.serverSelectorPanel);
            });
        });

        // Подключение
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
        this.statusText.textContent = message;
        this.statusIndicator.className = 'status-indicator';
        if (type === 'connecting') {
            this.statusIndicator.classList.add('connecting');
        } else if (type === 'disconnected') {
            this.statusIndicator.classList.add('disconnected');
        }
        console.log('[STATUS]', message);
    }

    updateSystemTime() {
        const now = new Date();
        this.systemTime.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    addMessage(username, text, time = null) {
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
        setTimeout(() => {
            messageElement.classList.add('appeared');
        }, 10);

        const messagesWrapper = this.messagesContainer.parentElement;
        if (messagesWrapper) {
            messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
        }
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        if (message) {
            this.addMessage('Вы', message);
            this.messageInput.value = '';
            const messagesWrapper = this.messagesContainer.parentElement;
            if (messagesWrapper) {
                messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
            }
        }
    }

    async autoConnect() {
        this.updateStatus('Автоподключение...', 'connecting');
        this.micButtonText.textContent = 'Подключение...';
        try {
            console.log('Запрашиваем доступ к микрофону...');
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    echoCancellationType: 'system'
                },
                video: false
            });
            console.log('Микрофон получен', this.stream);
            await this.registerClient();
            this.startKeepAlive();
            const rtpCapabilities = await this.getRtpCapabilities();
            console.log('RTP capabilities:', rtpCapabilities);
            this.device = new mediasoupClient.Device();
            await this.device.load({ routerRtpCapabilities: rtpCapabilities });
            console.log('Device загружен');
            await this.createTransports();
            console.log('Транспорты созданы');
            this.isConnected = true;
            this.updateStatus('Подключено', 'normal');
            this.micButtonText.textContent = 'Включить микрофон';
            this.micButton.disabled = false;
            this.micButton.onclick = () => this.toggleMicrophone();
            if (this.mobileMicBtn) {
                this.mobileMicBtn.onclick = () => this.toggleMicrophone();
            }
            this.messageInput.disabled = false;
            this.startParticipantUpdates();
            this.addMessage('System', 'Успешно подключено! Нажмите кнопку, чтобы включить микрофон.');
        } catch (error) {
            this.updateStatus('Ошибка: ' + error.message, 'disconnected');
            this.micButtonText.textContent = 'Ошибка подключения';
            this.micButton.disabled = false;
            console.error('[AUTO CONNECT ERROR]', error);
        }
    }

    async registerClient() {
        const response = await fetch(`${this.SERVER_URL}/api/client/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientID: this.clientID })
        });
        return response.json();
    }

    startKeepAlive() {
        this.keepAliveInterval = setInterval(async () => {
            try {
                await this.registerClient();
            } catch (error) {
                console.log('[KEEP-ALIVE ERROR]', error);
            }
        }, 5000);
    }

    async getRtpCapabilities() {
        const response = await fetch(`${this.SERVER_URL}/api/rtp-capabilities`);
        return response.json();
    }

    async createTransports() {
        const sendTransportData = await this.createTransport('send');
        this.sendTransport = this.device.createSendTransport({
            id: sendTransportData.transportId,
            iceParameters: sendTransportData.iceParameters,
            iceCandidates: sendTransportData.iceCandidates,
            dtlsParameters: sendTransportData.dtlsParameters
        });
        this.setupSendTransport();
        const recvTransportData = await this.createTransport('recv');
        this.recvTransport = this.device.createRecvTransport({
            id: recvTransportData.transportId,
            iceParameters: recvTransportData.iceParameters,
            iceCandidates: recvTransportData.iceCandidates,
            dtlsParameters: recvTransportData.dtlsParameters
        });
        this.setupRecvTransport();
    }

    async createTransport(direction) {
        const response = await fetch(`${this.SERVER_URL}/api/transport/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Client-ID': this.clientID
            },
            body: JSON.stringify({
                clientID: this.clientID,
                direction: direction
            })
        });
        return response.json();
    }

    setupSendTransport() {
        this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await fetch(`${this.SERVER_URL}/api/transport/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Client-ID': this.clientID
                    },
                    body: JSON.stringify({
                        transportId: this.sendTransport.id,
                        dtlsParameters
                    })
                });
                callback();
            } catch (error) {
                errback(error);
            }
        });
        this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
            try {
                const response = await fetch(`${this.SERVER_URL}/api/produce`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Client-ID': this.clientID
                    },
                    body: JSON.stringify({
                        transportId: this.sendTransport.id,
                        kind,
                        rtpParameters
                    })
                });
                const data = await response.json();
                callback({ id: data.producerId });
            } catch (error) {
                errback(error);
            }
        });
    }

    setupRecvTransport() {
        this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await fetch(`${this.SERVER_URL}/api/transport/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Client-ID': this.clientID
                    },
                    body: JSON.stringify({
                        transportId: this.recvTransport.id,
                        dtlsParameters
                    })
                });
                callback();
            } catch (error) {
                errback(error);
            }
        });
    }

    async toggleMicrophone() {
        if (this.isMicActive) {
            await this.stopMicrophone();
        } else {
            await this.startMicrophone();
        }
    }

    async startMicrophone() {
        try {
            if (!this.stream || this.stream.getAudioTracks().length === 0 || this.stream.getAudioTracks()[0].readyState === 'ended') {
                this.updateStatus('Получение доступа к микрофону...', 'connecting');
                this.stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        echoCancellationType: 'system'
                    },
                    video: false
                });
            }
            const audioTrack = this.stream.getAudioTracks()[0];
            const encodings = [
                {
                    maxBitrate: this.bitrate,
                    dtx: this.dtxEnabled,
                    fec: this.fecEnabled
                }
            ];
            this.audioProducer = await this.sendTransport.produce({
                track: audioTrack,
                encodings: encodings
            });
            this.isMicActive = true;
            this.micButton.classList.add('active');
            this.micButtonText.textContent = 'Выключить микрофон';
            this.selfStatus.className = 'member-status active';
            this.selfStatusDesktop.className = 'member-status active';
            this.updateStatus('Микрофон включен - вас слышат!', 'normal');
            this.addMessage('System', `Микрофон включен - вас слышат! (Битрейт: ${this.bitrate/1000} кбит/с, DTX: ${this.dtxEnabled ? 'вкл' : 'выкл'}, FEC: ${this.fecEnabled ? 'вкл' : 'выкл'})`);
            if (this.mobileMicBtn) {
                this.mobileMicBtn.textContent = '🎤';
                this.mobileMicBtn.style.color = '#ed4245';
            }
        } catch (error) {
            this.updateStatus('Ошибка включения микрофона: ' + error.message, 'disconnected');
            console.error('[MIC ERROR]', error);
        }
    }

    async stopMicrophone() {
        if (this.audioProducer) {
            try {
                await fetch(`${this.SERVER_URL}/api/producer/close`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Client-ID': this.clientID
                    },
                    body: JSON.stringify({ producerId: this.audioProducer.id })
                });
                this.audioProducer.close();
                this.audioProducer = null;
            } catch (error) {
                console.error('[MIC CLOSE ERROR]', error);
            }
        }
        this.isMicActive = false;
        this.micButton.classList.remove('active');
        this.micButtonText.textContent = 'Включить микрофон';
        this.selfStatus.className = 'member-status muted';
        this.selfStatusDesktop.className = 'member-status muted';
        this.updateStatus('Микрофон выключен - вы только слушаете', 'normal');
        this.addMessage('System', 'Микрофон выключен - вы только слушаете');
        if (this.mobileMicBtn) {
            this.mobileMicBtn.textContent = '🎤';
            this.mobileMicBtn.style.color = '#b9bbbe';
        }
    }

    async updateParticipants() {
        try {
            const response = await fetch(`${this.SERVER_URL}/api/clients?clientID=${this.clientID}`);
            const data = await response.json();
            this.updateMembersList(data.clients);
            this.updateMembersListDesktop(data.clients);
            const otherClients = data.clients.filter(clientId => clientId !== this.clientID);
            for (const clientId of otherClients) {
                await this.consumeClientProducers(clientId);
            }
        } catch (error) {
            console.error('[PARTICIPANTS ERROR]', error);
        }
    }

    updateMembersList(clients) {
        const otherClients = clients.filter(clientId => clientId !== this.clientID);
        this.membersCount.textContent = otherClients.length + 1;
        let membersHTML = `
            <div class="member-item">
                <div class="member-avatar">Вы</div>
                <div class="member-name">Вы</div>
                <div class="member-status ${this.isMicActive ? 'active' : 'muted'}" id="selfStatus"></div>
            </div>
        `;
        otherClients.forEach(clientId => {
            const shortId = clientId.substring(0, 6);
            const firstChar = shortId.charAt(0).toUpperCase();
            membersHTML += `
                <div class="member-item">
                    <div class="member-avatar">${firstChar}</div>
                    <div class="member-name">${shortId}</div>
                    <div class="member-status"></div>
                </div>
            `;
        });
        this.membersList.innerHTML = membersHTML;
        this.selfStatus = document.getElementById('selfStatus');
    }

    updateMembersListDesktop(clients) {
        const otherClients = clients.filter(clientId => clientId !== this.clientID);
        this.membersCountDesktop.textContent = otherClients.length + 1;
        let membersHTML = `
            <div class="member-item">
                <div class="member-avatar">Вы</div>
                <div class="member-name">Вы</div>
                <div class="member-status ${this.isMicActive ? 'active' : 'muted'}" id="selfStatusDesktop"></div>
            </div>
        `;
        otherClients.forEach(clientId => {
            const shortId = clientId.substring(0, 6);
            const firstChar = shortId.charAt(0).toUpperCase();
            membersHTML += `
                <div class="member-item">
                    <div class="member-avatar">${firstChar}</div>
                    <div class="member-name">${shortId}</div>
                    <div class="member-status"></div>
                </div>
            `;
        });
        this.membersListDesktop.innerHTML = membersHTML;
        this.selfStatusDesktop = document.getElementById('selfStatusDesktop');
    }

    async consumeClientProducers(clientId) {
        if (clientId === this.clientID) return;
        try {
            const response = await fetch(`${this.SERVER_URL}/api/client/${clientId}/producers`);
            const data = await response.json();
            for (const producerId of data.producers) {
                if (!this.consumers.has(producerId)) {
                    await this.consumeProducer(producerId, clientId);
                }
            }
        } catch (error) {
            console.error('[CONSUME CLIENT ERROR]', error);
        }
    }

    async consumeProducer(producerId, clientId) {
        if (clientId === this.clientID) return;
        try {
            const response = await fetch(`${this.SERVER_URL}/api/consume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Client-ID': this.clientID
                },
                body: JSON.stringify({
                    producerId: producerId,
                    rtpCapabilities: this.device.rtpCapabilities,
                    transportId: this.recvTransport.id
                })
            });
            const data = await response.json();
            if (data.error) {
                console.error('[CONSUME ERROR]', data.error);
                return;
            }
            const consumer = await this.recvTransport.consume({
                id: data.consumerId,
                producerId: data.producerId,
                kind: data.kind,
                rtpParameters: data.rtpParameters
            });
            this.consumers.set(producerId, consumer);
            this.playAudio(consumer.track, clientId, producerId);
        } catch (error) {
            console.error('[CONSUME PRODUCER ERROR]', error);
        }
    }

    playAudio(track, clientId, producerId) {
        try {
            const mediaStream = new MediaStream([track.clone()]);
            const audioElement = document.createElement('audio');
            audioElement.srcObject = mediaStream;
            audioElement.volume = 0.8;
            audioElement.style.display = 'none';
            document.body.appendChild(audioElement);
            setTimeout(() => {
                const playPromise = audioElement.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => console.log('[AUDIO] Playback started for:', clientId))
                        .catch(err => console.log('[AUDIO] Playback failed for:', clientId, err));
                }
            }, 100);
            if (!window.audioElements) window.audioElements = new Map();
            window.audioElements.set(producerId, audioElement);
        } catch (error) {
            console.error('[AUDIO ERROR]', error);
        }
    }

    async startParticipantUpdates() {
        await this.updateParticipants();
        this.updateInterval = setInterval(async () => {
            await this.updateParticipants();
        }, 3000);
    }

    openSettings() {
        this.bitrateSlider.value = this.bitrate / 1000;
        this.bitrateValue.textContent = this.bitrateSlider.value;
        this.dtxCheckbox.checked = this.dtxEnabled;
        this.fecCheckbox.checked = this.fecEnabled;
        this.settingsModal.style.display = 'block';
    }

    async applySettings() {
        const newBitrate = parseInt(this.bitrateSlider.value) * 1000;
        const newDtx = this.dtxCheckbox.checked;
        const newFec = this.fecCheckbox.checked;
        const bitrateChanged = newBitrate !== this.bitrate;
        const dtxChanged = newDtx !== this.dtxEnabled;
        const fecChanged = newFec !== this.fecEnabled;
        if (bitrateChanged || dtxChanged || fecChanged) {
            this.bitrate = newBitrate;
            this.dtxEnabled = newDtx;
            this.fecEnabled = newFec;
            this.addMessage('System', `Настройки обновлены: Битрейт ${this.bitrate/1000} кбит/с, DTX ${this.dtxEnabled ? 'вкл' : 'выкл'}, FEC ${this.fecEnabled ? 'вкл' : 'выкл'}`);
            if (this.isMicActive) {
                await this.updateProducerSettings();
            }
        }
        this.settingsModal.style.display = 'none';
    }

    async updateProducerSettings() {
        await this.stopMicrophone();
        await this.startMicrophone();
        this.addMessage('System', 'Настройки применены. Микрофон перезапущен.');
    }

    openPanel(panel) {
        panel.classList.add('visible');
        panel.style.display = 'flex';
    }

    closePanel(panel) {
        panel.classList.remove('visible');
        setTimeout(() => {
            if (!panel.classList.contains('visible')) {
                panel.style.display = 'none';
            }
        }, 300);
    }

    destroy() {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.audioProducer) this.audioProducer.close();
        this.consumers.forEach(consumer => consumer.close());
        if (this.sendTransport) this.sendTransport.close();
        if (this.recvTransport) this.recvTransport.close();
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());
        if (window.audioElements) {
            window.audioElements.forEach(element => {
                if (element.parentNode) element.parentNode.removeChild(element);
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof mediasoupClient === 'undefined') {
        document.getElementById('statusText').textContent = 'Ошибка: mediasoup-client не загружен';
        document.getElementById('statusIndicator').className = 'status-indicator disconnected';
        return;
    }
    new VoiceChatClient();
});

window.addEventListener('beforeunload', () => {
    if (window.voiceChatClient) {
        window.voiceChatClient.destroy();
    }
});
