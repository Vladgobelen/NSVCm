import AuthManager from './AuthManager.js';
import MediaManager from './MediaManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import Utils from './Utils.js';
import TextChatManager from './TextChatManager.js';
import MembersManager from './MembersManager.js';

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
        this.sseConnection = null;
        this.wasMicActiveBeforeReconnect = false;
        this.isReconnecting = false;
        UIManager.setClient(this);

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
            if (!this.currentServerId) {
                alert('Сначала выберите сервер');
                return;
            }
            
            UIManager.openCreateRoomModal(this, (name) => {
                RoomManager.createRoom(this, this.currentServerId, name);
            });
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
            console.error('Auto connect error:', err);
            UIManager.showError('Критическая ошибка: не удалось загрузить систему авторизации');
        }
    }

    async disconnectFromRoom() {
        if (this.currentRoom) {
            MediaManager.disconnect(this);
            
            // Отключаемся от текстового чата
            TextChatManager.leaveTextRoom(this, this.currentRoom);
            
            // Очищаем список участников
            MembersManager.clearMembers();
            
            this.destroySocket();
            this.currentRoom = null;
            this.isConnected = false;
            this.isMicActive = false;
            this.existingProducers.clear();
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
            console.error('Error joining server:', error);
            this.showError(`❌ Доступ запрещён: ${error.message}`);
            return false;
        }
    }

    async joinRoom(roomId) {
        try {
            this.showMessage('System', 'Подключение к комнате...');
            
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
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Ошибка входа: ${res.status}`);
            }
            
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            this.clientID = data.clientId;
            this.mediaData = data.mediaData;
            this.currentRoom = roomId;
            
            this.setupSocketConnection();
            
            await MediaManager.connect(this, roomId, data.mediaData);
            this.updateMicButtonState();
            
            if (this.socket) {
                this.socket.emit('subscribe-to-producers', { roomId });
                this.socket.emit('get-current-producers', { roomId });
            }
            
            // Подключаемся к текстовому чату через SSE
            TextChatManager.joinTextRoom(this, roomId);
            
            // Инициализируем список участников
            MembersManager.initializeRoomMembers(this, []);
            
            this.showMessage('System', 'Вы вошли в комнату');
            UIManager.onRoomJoined(this, data.roomName);
            
        } catch (e) {
            console.error('Error joining room:', e);
            UIManager.updateStatus('Ошибка: ' + e.message, 'disconnected');
            UIManager.showError('Не удалось присоединиться к комнате: ' + e.message);
        }
    }

    setupSocketConnection() {
        this.destroySocket();
        if (!this.token) return;
        
        this.socket = io(this.API_SERVER_URL, {
            auth: {
                token: this.token,
                userId: this.userId,
                clientId: this.clientID,
                username: this.username
            },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        // Обработчики для голосового чата
        this.socket.on('new-producer', async (data) => {
            if (data.clientID !== this.clientID) {
                try {
                    await MediaManager.createConsumer(this, data.producerId);
                    this.existingProducers.add(data.producerId);
                } catch (error) {
                    console.error('Error creating consumer:', error);
                }
            }
        });
        
        this.socket.on('current-producers', async (data) => {
            // Добавляем проверку на существование data.producers
            if (!data || !data.producers || !Array.isArray(data.producers)) {
                console.log('No producers data available');
                return;
            }
            
            for (const producer of data.producers) {
                if (producer.clientID !== this.clientID && 
                    !this.existingProducers.has(producer.id)) {
                    try {
                        await MediaManager.createConsumer(this, producer.id);
                        this.existingProducers.add(producer.id);
                    } catch (error) {
                        console.error('Error creating consumer:', error);
                    }
                }
            }
        });
        
        // Настройка обработчиков участников
        MembersManager.setupSocketHandlers(this);
        
        // Настройка обработчиков текстового чата
        TextChatManager.setupSocketHandlers(this);
        
        // Обработчик переподключения
        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            UIManager.updateStatus('Переподключено', 'connected');
            
            // При переподключении повторно присоединяемся к комнатам
            if (this.currentRoom) {
                this.socket.emit('subscribe-to-producers', { roomId: this.currentRoom });
                this.socket.emit('get-current-producers', { roomId: this.currentRoom });
                
                // Переподключаем SSE соединение для текстового чата
                TextChatManager.joinTextRoom(this, this.currentRoom);
            }
        });
        
        // Обработчик ошибок сокета
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            UIManager.showError('Ошибка соединения: ' + (error.message || 'неизвестная ошибка'));
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
            // Проверяем, что мы в комнате
            if (!this.currentRoom) {
                UIManager.showError('Микрофон доступен только в комнатах');
                return;
            }
            
            if (this.isMicActive) {
                await MediaManager.stopMicrophone(this);
                MembersManager.updateCurrentUserMicState(this, false);
            } else {
                try {
                    await MediaManager.startMicrophone(this);
                    MembersManager.updateCurrentUserMicState(this, true);
                    
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
            console.error('Error toggling microphone:', error);
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
        
        // Отправка текстового сообщения через REST API
        TextChatManager.sendMessage(this, text).catch((error) => {
            console.error('Error sending message:', error);
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
                console.error('Sync error:', error);
            }
        }, 5000);
    }

    async startConsuming() {
        if (!this.isConnected || !this.currentRoom) {
            return;
        }
        
        try {
            if (!this.mediaData || !this.currentRoom || !this.isConnected) {
                return;
            }
            
            const response = await fetch(`${this.API_SERVER_URL}/api/room/${this.currentRoom}/producers`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                return;
            }
            
            const data = await response.json();
            
            // Добавляем проверку на существование data.producers
            if (!data || !data.producers || !Array.isArray(data.producers)) {
                return;
            }
            
            const activeProducerIds = new Set(data.producers.map(p => p.id));
            
            for (const producerId of this.existingProducers) {
                if (!activeProducerIds.has(producerId)) {
                    const consumer = this.consumers.get(producerId);
                    if (consumer) {
                        try {
                            consumer.close();
                        } catch (e) {
                            console.error('Error closing consumer:', e);
                        }
                        this.consumers.delete(producerId);
                        
                        if (window.audioElements && window.audioElements.has(producerId)) {
                            try {
                                window.audioElements.get(producerId).pause();
                                window.audioElements.get(producerId).srcObject = null;
                                window.audioElements.get(producerId).remove();
                                window.audioElements.delete(producerId);
                            } catch (e) {
                                console.error('Error cleaning up audio element:', e);
                            }
                        }
                    }
                    this.existingProducers.delete(producerId);
                }
            }
            
            for (const producer of data.producers) {
                if (producer.clientID !== this.clientID && !this.existingProducers.has(producer.id)) {
                    try {
                        await MediaManager.createConsumer(this, producer.id);
                        this.existingProducers.add(producer.id);
                    } catch (error) {
                        console.error('Error creating consumer:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error starting consuming:', error);
        }
    }

    async reconnectToRoom(roomId) {
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
