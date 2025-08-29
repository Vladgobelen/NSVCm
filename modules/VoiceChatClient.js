import AuthManager from './AuthManager.js';
import MediaManager from './MediaManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import Utils from './Utils.js';
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
        this.existingProducers = new Set();
        this.stream = null;
        this.isMicActive = false;
        this.currentRoom = null;
        this.currentServerId = null;
        this.currentServer = null;
        this.servers = [];
        this.members = [];
        this.keepAliveInterval = null;
        this.bitrate = 32000;
        this.dtxEnabled = true;
        this.fecEnabled = true;
        this.isConnected = false;
        this.mediaData = null;
        this.userId = null;
        this.token = null;
        this.username = null;
        this.syncInterval = null;
        this.activePanel = 'servers';
        this.inviteServerId = null;
        this.isCreatingRoom = false;
        this.socket = null;
        
        this.init();
    }
    async init() {
        this.initElements();
        this.initEventListeners();
        await this.initAutoConnect();
    }
    initElements() {
        this.micButton = document.querySelector('.mic-button');
        this.micToggleBtn = document.querySelector('.mic-toggle-btn');
        this.messageInput = document.querySelector('.message-input');
        this.sendButton = document.querySelector('.send-btn');
        this.currentRoomTitle = document.querySelector('.current-room-title');
        this.toggleSidebarBtn = document.querySelector('.toggle-sidebar-btn');
        this.toggleMembersBtn = document.querySelector('.toggle-members-btn');
        this.settingsBtn = document.querySelector('.settings-btn');
        this.closePanelBtn = document.querySelector('.close-panel-btn');
        this.closeSidebarBtn = document.querySelector('.close-sidebar-btn');
        this.createServerBtn = document.querySelector('.create-server-btn');
        this.createRoomBtn = document.querySelector('.create-room-btn');
        this.serversToggleBtn = document.querySelector('#serversToggle');
        this.roomsToggleBtn = document.querySelector('#roomsToggle');
        this.serversList = document.querySelector('.servers-list');
        this.roomsList = document.querySelector('.rooms-list');
        this.membersList = document.querySelector('.members-list');
        this.messagesContainer = document.querySelector('.messages-container');
        this.serversPanel = document.getElementById('servers-panel'); 
        this.roomsPanel = document.getElementById('rooms-panel'); 
        this.sidebar = document.querySelector('.sidebar');
        this.membersPanel = document.querySelector('.members-panel');
        this.serverSearchInput = document.querySelector('#serverSearch');
        this.clearSearchBtn = document.querySelector('#clearSearchBtn');    
        this.clearSearchBtn.addEventListener('click', () => {
            ServerManager.clearSearchAndShowAllServers(this);
        });
    }
    initEventListeners() {
        this.micButton.addEventListener('click', () => this.toggleMicrophone());
        this.micToggleBtn.addEventListener('click', () => this.toggleMicrophone());
        
        this.messageInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                this.sendMessage(this.messageInput.value);
                this.messageInput.value = '';
            }
        });
        this.sendButton.addEventListener('click', () => {
            this.sendMessage(this.messageInput.value);
            this.messageInput.value = '';
        });
        this.toggleSidebarBtn.addEventListener('click', () => {
            this.sidebar.classList.toggle('open');
        });
        this.toggleMembersBtn.addEventListener('click', () => {
            this.membersPanel.classList.toggle('open');
        });
        this.closePanelBtn.addEventListener('click', () => {
            this.membersPanel.classList.remove('open');
        });
        this.closeSidebarBtn.addEventListener('click', () => {
            this.sidebar.classList.remove('open');
        });
        this.settingsBtn.addEventListener('click', () => {
            UIManager.openSettings(this);
        });
        this.createServerBtn.addEventListener('click', () => {
            ServerManager.createServer(this);
        });
        this.createRoomBtn.addEventListener('click', () => {
            RoomManager.createRoom(this);
        });
        this.serversToggleBtn.addEventListener('click', () => {
            ServerManager.clearSearchAndShowAllServers(this);
            this.showPanel('servers');
        });
        this.roomsToggleBtn.addEventListener('click', () => {
            this.showPanel('rooms');
        });
        this.serverSearchInput.addEventListener('input', (e) => {
            this.searchServers(e.target.value);
        });
    }
    showPanel(panelName) {
        if (!this.serversPanel) this.serversPanel = document.getElementById('servers-panel');
        if (!this.roomsPanel) this.roomsPanel = document.getElementById('rooms-panel');
        if (!this.serversToggleBtn) this.serversToggleBtn = document.querySelector('#serversToggle');
        if (!this.roomsToggleBtn) this.roomsToggleBtn = document.querySelector('#roomsToggle');
    
        if (!this.serversPanel || !this.roomsPanel || !this.serversToggleBtn || !this.roomsToggleBtn) {
            console.error('Элементы панелей не найдены');
            return;
        }
    
        this.activePanel = panelName;
    
        if (panelName === 'servers') {
            this.serversToggleBtn.classList.add('active');
            this.roomsToggleBtn.classList.remove('active');
            this.serversPanel.classList.add('active');
            this.roomsPanel.classList.remove('active');
        } else {
            this.serversToggleBtn.classList.remove('active');
            this.roomsToggleBtn.classList.add('active');
            this.serversPanel.classList.remove('active');
            this.roomsPanel.classList.add('active');
        }
    }
    processUrlParams() {
        const params = new URLSearchParams(window.location.search);
        this.currentServerId = params.get('server');
        this.currentRoom = params.get('room');
        this.inviteServerId = params.get('invite');
    }
    async initAutoConnect() {
        this.processUrlParams();
        try {
            const autoLoggedIn = await AuthManager.tryAutoLogin(this);
            if (autoLoggedIn) {
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
                            UIManager.showError('Нет доступа к серверу.');
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
            AuthManager.showAuthModal(this);
        } catch (err) {
            console.error('Ошибка в initAutoConnect:', err);
            UIManager.showError('Критическая ошибка: не удалось загрузить систему авторизации');
        }
    }
    async disconnectFromRoom() {
        if (this.currentRoom) {
            MediaManager.disconnect(this);
            this.destroySocket();
            this.currentRoom = null;
            this.isConnected = false;
            this.isMicActive = false;
            this.updateMicButtonState();
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
                this.showMessage('System', `✅ Вы присоединились к "${server.name}"`);
            }
            return true;
        } catch (error) {
            console.error('Ошибка вступления в сервер:', error);
            this.showError(`❌ Доступ запрещён: ${error.message}`);
            return false;
        }
    }
    async joinRoom(roomId) {
        try {
            this.showMessage('System', 'Подключение к комнате...');
            
            // Очищаем предыдущее соединение
            this.disconnectFromRoom();
            
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
            
            if (!res.ok) throw new Error(`Ошибка входа: ${res.status}`);
            
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            this.clientID = data.clientId;
            this.mediaData = data.mediaData;
            this.currentRoom = roomId;
            
            // Настраиваем socket соединение
            this.setupSocketConnection();
            
            if (data.roomType === 'voice') {
                await MediaManager.connect(this, roomId, data.mediaData);
                this.updateMicButtonState();
                
                // Запрашиваем текущих продюсеров
                if (this.socket) {
                    this.socket.emit('subscribe-to-producers', { roomId });
                }
            }
            
            this.showMessage('System', 'Вы вошли в комнату');
            UIManager.onRoomJoined(this, data.roomName);
            
        } catch (e) {
            console.error('Ошибка входа в комнату:', e);
            UIManager.updateStatus('Ошибка: ' + e.message, 'disconnected');
        }
    }
    setupSocketConnection() {
        // Закрываем предыдущее соединение
        this.destroySocket();
        
        // Создаем новое соединение
        this.socket = io(this.API_SERVER_URL, {
            auth: {
                token: this.token,
                userId: this.userId,
                clientId: this.clientID,
                username: this.username
            }
        });
        // Обработчики событий
        this.socket.on('connect', () => {
            console.log('✅ Подключение к Socket.IO установлено');
        });
        this.socket.on('disconnect', () => {
            console.log('❌ Подключение к Socket.IO разорвано');
        });
        this.socket.on('new-producer', async (data) => {
            console.log('Получено уведомление о новом продюсере:', data);
            
            if (data.clientID === this.clientID) return;
            
            try {
                await MediaManager.createConsumer(this, data.producerId);
                this.existingProducers.add(data.producerId);
            } catch (error) {
                console.error('Ошибка создания consumer:', error);
            }
        });
        this.socket.on('current-producers', async (data) => {
            console.log('Получен список текущих продюсеров:', data.producers);
            
            for (const producer of data.producers) {
                if (producer.clientID !== this.clientID && 
                    !this.existingProducers.has(producer.id)) {
                    try {
                        await MediaManager.createConsumer(this, producer.id);
                        this.existingProducers.add(producer.id);
                    } catch (error) {
                        console.error('Ошибка создания consumer:', error);
                    }
                }
            }
        });
    }
    destroySocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
    updateMicButtonState() {
        let status;
        if (!this.isConnected) {
            status = 'disconnected';
        } else if (this.isMicActive) {
            status = 'active';
        } else {
            status = 'connected';
        }
        UIManager.updateMicButton(status);
    }
    async toggleMicrophone() {
        try {
            if (this.isMicActive) {
                await MediaManager.stopMicrophone(this);
            } else {
                try {
                    await MediaManager.startMicrophone(this);
                    
                    // Уведомляем других клиентов о новом продюсере
                    if (this.socket && this.audioProducer) {
                        this.socket.emit('new-producer-notification', {
                            roomId: this.currentRoom,
                            producerId: this.audioProducer.id,
                            clientID: this.clientID,
                            kind: 'audio'
                        });
                    }
                } catch (error) {
                    if (error.message.includes('permission') || error.message.includes('разрешение')) {
                        UIManager.showError('Необходимо разрешение на использование микрофона');
                    } else {
                        throw error;
                    }
                }
            }
            this.updateMicButtonState();
        } catch (error) {
            console.error('Ошибка переключения микрофона:', error);
            UIManager.showError('Ошибка микрофона: ' + error.message);
            this.updateMicButtonState();
        }
    }
    sendMessage(text) {
        if (!text.trim()) return;
        if (!this.currentRoom) {
            this.showError('Вы не в комнате');
            return;
        }
        
        this.showMessage(this.username, text);
        
        fetch(`${this.API_SERVER_URL}/api/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({
                roomId: this.currentRoom,
                userId: this.userId,
                text: text.trim()
            })
        }).catch(error => {
            this.showError('Ошибка отправки сообщения');
        });
    }
    startSyncInterval() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        
        this.syncInterval = setInterval(async () => {
            try {
                await ServerManager.loadServers(this);
                if (this.currentServerId) {
                    await RoomManager.loadRoomsForServer(this, this.currentServerId);
                }
                
                if (this.currentRoom && this.isConnected) {
                    await this.startConsuming();
                }
            } catch (error) {
                console.error('Ошибка синхронизации:', error);
            }
        }, 5000);
    }
    async startConsuming() {
        if (!this.isConnected || !this.currentRoom) {
            console.log('[MEDIA] Пропускаем потребление: не подключен к комнате');
            return;
        }
        
        try {
            if (!this.mediaData || !this.currentRoom || !this.isConnected) {
                console.log('[MEDIA] Не могу начать потребление: отсутствуют необходимые данные');
                return;
            }
            console.log('[MEDIA] Запрос производителей комнаты:', this.currentRoom);
            
            const response = await fetch(`${this.API_SERVER_URL}/api/room/${this.currentRoom}/producers`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.warn('[MEDIA] Не удалось получить производителей:', response.status);
                return;
            }
            
            const data = await response.json();
            console.log('[MEDIA] Получены производители:', data.producers);
            
            const activeProducerIds = new Set(data.producers.map(p => p.id));
            
            // Удаляем старые consumer'ы для неактивных производителей
            for (const producerId of this.existingProducers) {
                if (!activeProducerIds.has(producerId)) {
                    const consumer = this.consumers.get(producerId);
                    if (consumer) {
                        try {
                            consumer.close();
                        } catch (e) {
                            console.warn('[MEDIA] Ошибка при закрытии consumer:', e);
                        }
                        this.consumers.delete(producerId);
                        
                        if (window.audioElements && window.audioElements.has(producerId)) {
                            try {
                                window.audioElements.get(producerId).pause();
                                window.audioElements.get(producerId).srcObject = null;
                                window.audioElements.get(producerId).remove();
                                window.audioElements.delete(producerId);
                            } catch (e) {
                                console.warn('[MEDIA] Ошибка при удалении аудио элемента:', e);
                            }
                        }
                    }
                    this.existingProducers.delete(producerId);
                }
            }
            
            // Создаем новые consumer'ы для активных производителей
            for (const producer of data.producers) {
                if (producer.clientID !== this.clientID && !this.existingProducers.has(producer.id)) {
                    try {
                        await MediaManager.createConsumer(this, producer.id);
                        this.existingProducers.add(producer.id);
                        console.log('[MEDIA] Создан consumer для producer:', producer.id);
                    } catch (error) {
                        console.error('[MEDIA] Ошибка создания consumer:', error);
                    }
                }
            }
        } catch (error) {
            console.error('[MEDIA] Ошибка потребления:', error);
        }
    }
    async reconnectToRoom(roomId) {
        console.log('Переподключение к комнате:', roomId);
        this.disconnectFromRoom();
        this.currentRoom = roomId;
        await this.joinRoom(roomId);
    }
    autoConnect() {
        this.sidebar.classList.add('open');
    }
    showMessage(user, text) {
        UIManager.addMessage(user, text);
    }
    showError(text) {
        UIManager.showError(text);
    }
    async searchServers(query) {
        await ServerManager.searchServers(this, query);
    }
}
export default VoiceChatClient;
