console.log('[APP] DOMContentLoaded — начало инициализации');
document.addEventListener('DOMContentLoaded', () => {
    console.log('[APP] DOM загружен');
    
    if (typeof mediasoupClient === 'undefined') {
        console.error('[APP] mediasoupClient не найден');
        const s = document.getElementById('statusText');
        const i = document.getElementById('statusIndicator');
        if (s) s.textContent = 'Ошибка: mediasoup-client не загружен';
        if (i) i.className = 'status-indicator disconnected';
        return;
    } else {
        console.log('[APP] mediasoupClient найден');
    }

    const waitForAuthManager = () => {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 600;
            const check = () => {
                attempts++;
                console.log(`[APP] Попытка ${attempts}: проверка AuthManager...`);
                if (typeof AuthManager !== 'undefined' && typeof AuthManager.registerUser === 'function') {
                    console.log('%c[APP] ✅ AuthManager.registerUser ДОСТУПЕН', 'color: green; font-weight: bold');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    console.error('%c[APP] ❌ AuthManager не загрузился за 30 секунд', 'color: red');
                    reject(new Error('AuthManager не загрузился'));
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
    };

    class VoiceChatClient {
        constructor() {
            this.API_SERVER_URL = 'https://ns.fiber-gate.ru';
            this.CHAT_API_URL = `${this.API_SERVER_URL}/api/join`;
            this.clientID = Utils.generateClientID();
            this.device = null;
            this.sendTransport = null;
            this.recvTransport = null;
            this.audioProducer = null;
            this.consumers = new Map();
            this.existingProducers = new Set(); // Новое свойство для отслеживания продюсеров
            this.stream = null;
            this.socket = null;
            this.isMicActive = false;
            this.currentRoom = null;
            this.currentServerId = null;
            this.currentServer = null;
            this.servers = [];
            this.members = [];
            this.keepAliveInterval = null;
            this.updateInterval = null;
            this.bitrate = 32000;
            this.dtxEnabled = true;
            this.fecEnabled = true;
            this.isConnecting = false;
            this.userId = null;
            this.token = null;
            this.username = null;
            this.isCreatingRoom = false;
            this.isConnected = false;
            this.mediaData = null;
            this.inviteServerId = null;
            this.syncInterval = null;
            this.producerCheckInterval = null; // Интервал проверки продюсеров
            
            window.voiceChatClient = this;
            this.initElements();
            this.initEventListeners();
            this.initAutoConnect();
        }

        initElements() {
            this.micButton = document.getElementById('micButton');
            this.micButtonText = document.getElementById('micButtonText');
            this.statusText = document.getElementById('statusText');
            this.statusIndicator = document.getElementById('statusIndicator');
            this.messageInput = document.getElementById('messageInput');
            this.systemTime = document.getElementById('systemTime');
            this.currentRoomTitle = document.getElementById('currentRoomTitle');
            this.mobileMicBtn = document.getElementById('mobileMicBtn');
            this.selfStatus = document.getElementById('selfStatus');
            this.serverSelectorPanel = document.getElementById('serverSelectorPanel');
            this.roomSelectorPanel = document.getElementById('roomSelectorPanel');
            this.membersPanel = document.getElementById('membersPanel');
            this.settingsModal = document.getElementById('settingsModal');
            this.openServerSelectorBtn = document.getElementById('openServerSelectorBtn');
            this.openServerBtnMobile = document.getElementById('openServerBtnMobile');
            this.openRoomBtnMobile = document.getElementById('openRoomBtnMobile');
            this.toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
            this.openSettingsBtn = document.getElementById('openSettingsBtn');
            this.openSettingsBtnMobile = document.getElementById('openSettingsBtnMobile');
            this.closeSettingsModal = document.getElementById('closeSettingsModal');
            this.closeServerPanelBtn = document.getElementById('closeServerPanelBtn');
            this.closeRoomPanelBtn = document.getElementById('closeRoomPanelBtn');
            this.closeMembersPanelBtn = document.getElementById('closeMembersPanelBtn');
            this.addServerBtn = document.getElementById('addServerBtn');
            this.toggleMembersBtn = document.getElementById('toggleMembersBtn');
            this.bitrateSlider = document.getElementById('bitrateSlider');
            this.bitrateValue = document.getElementById('bitrateValue');
            this.dtxCheckbox = document.getElementById('dtxCheckbox');
            this.fecCheckbox = document.getElementById('fecCheckbox');
            this.applySettingsBtn = document.getElementById('applySettingsBtn');
            this.messagesContainer = document.getElementById('messagesContainer');
            this.membersList = document.getElementById('membersList');
            this.membersCount = document.getElementById('membersCount');
            
            [this.serverSelectorPanel, this.roomSelectorPanel, this.membersPanel].forEach(p => {
                if (p) p.style.display = 'none';
            });
            if (this.settingsModal) this.settingsModal.style.display = 'none';
            Utils.updateSystemTime(this.systemTime);
        }

        initEventListeners() {
            if (this.micButton) this.micButton.addEventListener('click', () => this.toggleMicrophone());
            if (this.messageInput) this.messageInput.addEventListener('keypress', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ChatManager.sendMessage(this);
                }
            });
            if (this.openServerSelectorBtn) this.openServerSelectorBtn.addEventListener('click', () => UIManager.openPanel(this, this.serverSelectorPanel));
            if (this.openServerBtnMobile) this.openServerBtnMobile.addEventListener('click', () => UIManager.openPanel(this, this.serverSelectorPanel));
            if (this.openRoomBtnMobile) {
                this.openRoomBtnMobile.addEventListener('click', () => UIManager.openPanel(this, this.roomSelectorPanel));
            }
            if (this.toggleSidebarBtn) this.toggleSidebarBtn.addEventListener('click', UIManager.toggleSidebar);
            if (this.openSettingsBtn) this.openSettingsBtn.addEventListener('click', () => UIManager.openSettings(this));
            if (this.openSettingsBtnMobile) this.openSettingsBtnMobile.addEventListener('click', () => UIManager.openSettings(this));
            if (this.closeSettingsModal) this.closeSettingsModal.addEventListener('click', () => UIManager.closeSettings(this));
            if (this.closeServerPanelBtn) this.closeServerPanelBtn.addEventListener('click', () => UIManager.closePanel(this, this.serverSelectorPanel));
            if (this.closeRoomPanelBtn) this.closeRoomPanelBtn.addEventListener('click', () => UIManager.closePanel(this, this.roomSelectorPanel));
            if (this.closeMembersPanelBtn) this.closeMembersPanelBtn.addEventListener('click', () => UIManager.closePanel(this, this.membersPanel));
            if (this.addServerBtn) this.addServerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ServerManager.createServer(this);
            });
            if (this.toggleMembersBtn) this.toggleMembersBtn.addEventListener('click', () => UIManager.toggleMembersPanel(this));
            if (this.applySettingsBtn) this.applySettingsBtn.addEventListener('click', () => UIManager.applySettings(this));
            if (this.bitrateSlider && this.bitrateValue) {
                this.bitrateSlider.addEventListener('input', () => {
                    this.bitrateValue.textContent = this.bitrateSlider.value;
                });
            }
            document.addEventListener('click', unlockAudio, { once: true });
            function unlockAudio() {
                const a = new Audio();
                a.play().then(() => a.remove()).catch(() => {});
            }
        }

        processUrlParams() {
            const params = new URLSearchParams(window.location.search);
            this.currentServerId = params.get('server');
            this.currentRoom = params.get('room');
            this.inviteServerId = params.get('invite');
            console.log('[CLIENT] URL params:', {
                server: this.currentServerId,
                room: this.currentRoom,
                invite: this.inviteServerId
            });
        }

        async initAutoConnect() {
            console.log('[CLIENT] initAutoConnect — начало');
            this.processUrlParams();

            try {
                await waitForAuthManager();
                console.log('[CLIENT] initAutoConnect — AuthManager готов');

                const autoLoggedIn = await AuthManager.tryAutoLogin(this);
                if (autoLoggedIn) {
                    console.log('[CLIENT] Автовход успешен');
                    await ServerManager.loadServers(this);

                    let targetServerId = null;

                    if (this.inviteServerId) {
                        const serverExists = this.servers.some(s => s.id === this.inviteServerId);
                        if (serverExists) {
                            targetServerId = this.inviteServerId;
                        } else {
                            const joined = await this.joinServer(this.inviteServerId);
                            if (joined) {
                                targetServerId = this.inviteServerId;
                                await ServerManager.loadServers(this);
                            } else {
                                UIManager.addMessage(this, 'System', `Нет доступа к серверу.`);
                            }
                        }
                    } else if (this.currentServerId) {
                        const serverExists = this.servers.some(s => s.id === this.currentServerId);
                        if (serverExists) {
                            targetServerId = this.currentServerId;
                        }
                    }

                    if (targetServerId) {
                        this.currentServerId = targetServerId;
                        await RoomManager.loadRoomsForServer(this, targetServerId);
                        if (this.currentRoom) {
                            await this.reconnectToRoom(this.currentRoom);
                        }
                        this.startSyncInterval();
                    } else {
                        this.autoConnect();
                    }
                    return;
                }

                this.showAuthModal();
            } catch (err) {
                console.error('[CLIENT] Ошибка в initAutoConnect:', err);
                alert('Критическая ошибка: не удалось загрузить систему авторизации');
            }
        }

        async joinServer(serverId) {
            try {
                const res = await fetch(`${this.API_SERVER_URL}/api/servers/${serverId}/join`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ userId: this.userId, token: this.token })
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Не удалось присоединиться');
                }

                const data = await res.json();
                const server = data.server;

                const exists = this.servers.some(s => s.id === server.id);
                if (!exists) {
                    this.servers.push(server);
                    ServerManager.saveServersToLocalStorage(this);
                    ServerManager.renderServers(this);
                    UIManager.addMessage(this, 'System', `✅ Вы присоединились к "${server.name}"`);
                }

                return true;
            } catch (error) {
                console.error('[CLIENT] Ошибка вступления в сервер:', error);
                UIManager.addMessage(this, 'System', `❌ Доступ запрещён: ${error.message}`);
                return false;
            }
        }

        startSyncInterval() {
            if (this.syncInterval) clearInterval(this.syncInterval);
            
            this.syncInterval = setInterval(async () => {
                try {
                    console.log('[SYNC] Начало синхронизации');
                    await ServerManager.loadServers(this);
                    if (this.currentServerId) {
                        await RoomManager.loadRoomsForServer(this, this.currentServerId);
                    }
                    if (this.currentRoom && this.isConnected) {
                        await this.startConsuming();
                    }
                    console.log('[SYNC] Синхронизация завершена');
                } catch (error) {
                    console.error('[SYNC] Ошибка синхронизации:', error);
                }
            }, 15000); // Увеличено до 15 секунд
        }

        showAuthModal() {
            const users = AuthManager.getAllUsers();
            const savedUser = AuthManager.loadLastUser();
            const modal = document.createElement('div');
            modal.className = 'modal auth-modal';
            modal.style.display = 'block';
            modal.innerHTML = `
                <div class="modal-content auth-content">
                    <h2>Выберите пользователя</h2>
                    <div class="saved-users-list">
                        ${Object.keys(users).length === 0 
                            ? '<div class="no-users-message">Нет сохранённых пользователей</div>' 
                            : Object.values(users).map(u => `
                                <div class="saved-user-item" data-username="${u.username}">
                                    <span>${u.username}</span>
                                    <button class="remove-user-btn" data-user="${u.username}">✕</button>
                                </div>
                            `).join('')}
                    </div>
                    <input type="text" id="usernameInput" placeholder="Никнейм" value="${savedUser ? savedUser.username : ''}">
                    <input type="password" id="passwordInput" placeholder="Пароль">
                    <button id="authSubmitBtn">Войти</button>
                    <button id="createNewUserBtn">➕ Создать нового</button>
                </div>
            `;
            document.body.appendChild(modal);
            const usernameInput = modal.querySelector('#usernameInput');
            const passwordInput = modal.querySelector('#passwordInput');
            const submitBtn = modal.querySelector('#authSubmitBtn');

            modal.querySelectorAll('.saved-user-item').forEach(item => {
                item.addEventListener('click', () => {
                    const username = item.dataset.username;
                    const user = users[username];
                    usernameInput.value = username;
                    passwordInput.value = user.password;
                    passwordInput.focus();
                });
            });

            modal.querySelectorAll('.remove-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const username = btn.dataset.user;
                    if (confirm(`Удалить пользователя ${username}?`)) {
                        AuthManager.removeUser(username);
                        modal.remove();
                        this.showAuthModal();
                    }
                });
            });

            modal.querySelector('#createNewUserBtn').addEventListener('click', () => {
                usernameInput.value = '';
                passwordInput.value = '';
                usernameInput.focus();
            });

            const handleSubmit = async () => {
                const u = usernameInput.value.trim();
                const p = passwordInput.value.trim();
                if (u.length < 3 || p.length < 4) {
                    alert('Ник — от 3, пароль — от 4');
                    return;
                }
                const success = await AuthManager.registerUser(this, u, p);
                if (success) {
                    document.body.removeChild(modal);
                    await ServerManager.loadServers(this);

                    if (this.inviteServerId) {
                        const serverExists = this.servers.some(s => s.id === this.inviteServerId);
                        if (serverExists) {
                            this.currentServerId = this.inviteServerId;
                            await RoomManager.loadRoomsForServer(this, this.inviteServerId);
                            this.startSyncInterval();
                            return;
                        }
                    }

                    if (this.currentServerId) {
                        await RoomManager.loadRoomsForServer(this, this.currentServerId);
                        this.startSyncInterval();
                    }
                    if (this.currentRoom) {
                        await this.reconnectToRoom(this.currentRoom);
                    }
                }
            };

            submitBtn.addEventListener('click', handleSubmit);
            passwordInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') handleSubmit();
            });
        }

        async reconnectToRoom(roomId) {
            this.disconnectFromMedia();
            this.destroySocket();
            this.currentRoom = roomId;
            await this.joinRoom(roomId);
        }

        async joinRoom(roomId) {
            try {
                console.log('[JOIN] Вход в комнату:', roomId);
                const res = await fetch(this.CHAT_API_URL, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${this.token}` 
                    },
                    body: JSON.stringify({ 
                        roomId, 
                        userId: this.userId, 
                        token: this.token, 
                        clientId: this.clientID 
                    })
                });
                
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Ошибка входа: ${res.status} ${errorText}`);
                }
                
                const data = await res.json();
                console.log('[JOIN] Ответ от сервера:', data);
                
                if (!data.success) {
                    throw new Error(data.error || 'Не удалось войти в комнату');
                }
                
                this.clientID = data.clientId;
                this.mediaData = data.mediaData;
                await MediaManager.connect(this, roomId, data.mediaData);
                
                // Запускаем потребление аудиопотоков с задержкой
                setTimeout(() => {
                    this.startConsuming();
                }, 1000);
            } catch (e) {
                console.error('[JOIN] Ошибка входа в комнату:', e);
                UIManager.updateStatus(this, 'Ошибка: ' + e.message, 'disconnected');
            }
        }

        async toggleMicrophone() {
            if (this.isMicActive) {
                await MediaManager.stopMicrophone(this);
            } else {
                await MediaManager.startMicrophone(this);
            }
        }

        updateMobileMicButtonColor() {
            if (this.micButton) {
                this.micButton.style.background = this.isMicActive ? '#ed4245' : '#5865f2';
            }
        }

        disconnectFromMedia() {
            console.log('[MEDIA] Отключение медиаресурсов');
            
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
            }
            
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
            }
            
            if (this.producerCheckInterval) {
                clearInterval(this.producerCheckInterval);
                this.producerCheckInterval = null;
            }
            
            if (this.audioProducer) {
                console.log('[MEDIA] Закрытие audioProducer');
                this.audioProducer.close();
                this.audioProducer = null;
            }
            
            if (this.consumers && this.consumers.size > 0) {
                console.log('[MEDIA] Закрытие consumers:', this.consumers.size);
                this.consumers.forEach(consumer => {
                    try {
                        consumer.close();
                    } catch (e) {
                        console.error('[MEDIA] Ошибка при закрытии consumer:', e);
                    }
                });
                this.consumers.clear();
            }
            
            if (this.existingProducers) {
                this.existingProducers.clear();
            }
            
            if (this.sendTransport) {
                console.log('[MEDIA] Закрытие sendTransport');
                this.sendTransport.close();
                this.sendTransport = null;
            }
            
            if (this.recvTransport) {
                console.log('[MEDIA] Закрытие recvTransport');
                this.recvTransport.close();
                this.recvTransport = null;
            }
            
            if (this.stream) {
                console.log('[MEDIA] Остановка медиапотока');
                this.stream.getTracks().forEach(t => t.stop());
                this.stream = null;
            }
            
            if (window.audioElements) {
                window.audioElements.forEach(audio => {
                    try {
                        audio.pause();
                        audio.srcObject = null;
                    } catch (e) {
                        console.error('[MEDIA] Ошибка при очистке аудио элемента:', e);
                    }
                });
                window.audioElements.clear();
            }
            
            this.isMicActive = false;
            this.isConnected = false;
            MediaManager.updateMicUI(this, false);
            
            console.log('[MEDIA] Все медиаресурсы освобождены');
        }

        destroySocket() {
            if (this.socket) {
                console.log('[SOCKET] Закрытие сокета');
                this.socket.disconnect();
                this.socket = null;
            }
        }

        autoConnect() {
            UIManager.openPanel(this, this.serverSelectorPanel);
        }

        updateStatus(text, status) {
            if (this.statusText) this.statusText.textContent = text;
            if (this.statusIndicator) this.statusIndicator.className = `status-indicator ${status}`;
        }

        addMessage(user, text) {
            UIManager.addMessage(this, user, text);
        }

        async startConsuming() {
            try {
                if (!this.mediaData || !this.currentRoom || !this.isConnected) {
                    console.log('[CONSUME] Пропускаем потребление: нет медиаданных, комнаты или соединение неактивно');
                    return;
                }

                console.log('[CONSUME] Запрос списка производителей для комнаты:', this.currentRoom);
                
                const response = await fetch(`${this.API_SERVER_URL}/api/room/${this.currentRoom}/producers`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    console.error('[CONSUME] Ошибка при получении производителей:', response.status, response.statusText);
                    return;
                }
                
                const data = await response.json();
                console.log('[CONSUME] Получены производители:', data.producers);
                
                const activeProducerIds = new Set(data.producers.map(p => p.id));
                
                // Удаляем consumer'ы для неактивных producer'ов
                for (const producerId of this.existingProducers) {
                    if (!activeProducerIds.has(producerId)) {
                        console.log('[CONSUME] Удаляем consumer для неактивного producer:', producerId);
                        const consumer = this.consumers.get(producerId);
                        if (consumer) {
                            consumer.close();
                            this.consumers.delete(producerId);
                            
                            // Также удаляем аудио элемент
                            if (window.audioElements && window.audioElements.has(producerId)) {
                                const audio = window.audioElements.get(producerId);
                                audio.pause();
                                audio.srcObject = null;
                                window.audioElements.delete(producerId);
                            }
                        }
                        this.existingProducers.delete(producerId);
                    }
                }
                
                // Создаем consumer'ы только для новых producer'ов
                for (const producer of data.producers) {
                    if (producer.clientID !== this.clientID && !this.existingProducers.has(producer.id)) {
                        console.log('[CONSUME] Создаем consumer для нового producer:', producer.id);
                        await this.createConsumer(producer.id);
                        this.existingProducers.add(producer.id);
                    }
                }
            } catch (error) {
                console.error('[CONSUME] Ошибка при получении производителей:', error);
            }
        }

        async createConsumer(producerId) {
            try {
                console.log('[CONSUME] Создание потребителя для производителя:', producerId);
                
                const response = await fetch(`${this.mediaData.mediaServerUrl}/api/consume`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        producerId,
                        rtpCapabilities: this.device.rtpCapabilities,
                        transportId: this.recvTransport.id
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}: Не удалось создать потребителя`);
                }
                
                const data = await response.json();
                console.log('[CONSUME] Данные потребителя:', data);
                
                // Создаем потребитель
                const consumer = await this.recvTransport.consume({
                    id: data.id,
                    producerId: data.producerId,
                    kind: data.kind,
                    rtpParameters: data.rtpParameters
                });
                
                // Сохраняем потребителя
                this.consumers.set(producerId, consumer);
                
                // Воспроизводим аудио
                const audio = new Audio();
                const stream = new MediaStream([consumer.track.clone()]);
                audio.srcObject = stream;
                audio.autoplay = true;
                audio.volume = 0.8; // Устанавливаем комфортную громкость
                
                // Сохраняем аудио элемент для последующего управления
                if (!window.audioElements) {
                    window.audioElements = new Map();
                }
                window.audioElements.set(producerId, audio);
                
                console.log('[CONSUME] Потребитель создан и аудио воспроизводится');
                
            } catch (error) {
                console.error('[CONSUME] Ошибка при создании потребителя:', error);
            }
        }
    }

    console.log('[APP] Запуск VoiceChatClient...');
    window.client = new VoiceChatClient();
});
