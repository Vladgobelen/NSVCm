import AuthManager from './AuthManager.js';
import MediaManager from './MediaManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import Utils from './Utils.js';
import TextChatManager from './TextChatManager.js';
import UserPresenceManager from './UserPresenceManager.js';
import InviteManager from './InviteManager.js';
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
        this.rooms = [];
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
        this.pendingInviteCode = null;
        UIManager.setClient(this);

        this.init();
    }

    async init() {
        console.log('VoiceChatClient initializing...');
        this.initElements();
        this.initEventListeners();
        
        UserPresenceManager.init(this);
        InviteManager.init(this);
        
        await this.initAutoConnect();
    }

    initElements() {
        console.log('Initializing UI elements...');
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
        
        if (this.clearSearchBtn) {
            this.clearSearchBtn.addEventListener('click', () => {
                ServerManager.clearSearchAndShowAllServers(this);
            });
        } else {
            console.warn('Clear search button not found');
        }
    }

    initEventListeners() {
        console.log('Setting up event listeners...');
        
        if (this.micButton) {
            this.micButton.addEventListener('click', () => this.toggleMicrophone());
        }
        
        if (this.micToggleBtn) {
            this.micToggleBtn.addEventListener('click', () => this.toggleMicrophone());
        }
        
        if (this.messageInput) {
            this.messageInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') {
                    this.sendMessage(this.messageInput.value);
                    this.messageInput.value = '';
                }
            });
        }
        
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => {
                this.sendMessage(this.messageInput.value);
                this.messageInput.value = '';
            });
        }
        
        if (this.toggleSidebarBtn) {
            this.toggleSidebarBtn.addEventListener('click', () => {
                this.sidebar.classList.toggle('open');
            });
        }
        
        if (this.toggleMembersBtn) {
            this.toggleMembersBtn.addEventListener('click', () => {
                this.membersPanel.classList.toggle('open');
            });
        }
        
        if (this.closePanelBtn) {
            this.closePanelBtn.addEventListener('click', () => {
                this.membersPanel.classList.remove('open');
            });
        }
        
        if (this.closeSidebarBtn) {
            this.closeSidebarBtn.addEventListener('click', () => {
                this.sidebar.classList.remove('open');
            });
        }
        
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => {
                UIManager.openSettings(this);
            });
        }
        
        if (this.createServerBtn) {
            this.createServerBtn.addEventListener('click', () => {
                ServerManager.createServer(this);
            });
        }

        if (this.createRoomBtn) {
            this.createRoomBtn.addEventListener('click', () => {
                if (!this.currentServerId) {
                    alert('Сначала выберите сервер');
                    return;
                }
                
                UIManager.openCreateRoomModal(this, (name) => {
                    RoomManager.createRoom(this, this.currentServerId, name);
                });
            });
        }

        if (this.serversToggleBtn) {
            this.serversToggleBtn.addEventListener('click', () => {
                ServerManager.clearSearchAndShowAllServers(this);
                this.showPanel('servers');
            });
        }
        
        if (this.roomsToggleBtn) {
            this.roomsToggleBtn.addEventListener('click', () => {
                this.showPanel('rooms');
            });
        }
        
        if (this.serverSearchInput) {
            this.serverSearchInput.addEventListener('input', (e) => {
                this.searchServers(e.target.value);
            });
        }
    }

    showPanel(panelName) {
        console.log('Showing panel:', panelName);
        
        if (!this.serversPanel) this.serversPanel = document.getElementById('servers-panel');
        if (!this.roomsPanel) this.roomsPanel = document.getElementById('rooms-panel');
        if (!this.serversToggleBtn) this.serversToggleBtn = document.querySelector('#serversToggle');
        if (!this.roomsToggleBtn) this.roomsToggleBtn = document.querySelector('#roomsToggle');
    
        if (!this.serversPanel || !this.roomsPanel || !this.serversToggleBtn || !this.roomsToggleBtn) {
            console.error('Required panel elements not found');
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
        console.log('Processing URL parameters...');
        const params = new URLSearchParams(window.location.search);
        this.currentServerId = params.get('server');
        this.currentRoom = params.get('room');
        this.inviteServerId = params.get('invite');
        
        const inviteCode = params.get('invite');
        if (inviteCode && /^[a-zA-Z0-9]{4}$/.test(inviteCode)) {
            this.pendingInviteCode = inviteCode;
            console.log('Found pending invite code:', inviteCode);
        }
        
        console.log('URL params processed - server:', this.currentServerId, 'room:', this.currentRoom, 'invite:', this.inviteServerId);
    }

    async initAutoConnect() {
        console.log('Starting auto-connect process...');
        this.processUrlParams();
        
        try {
            const autoLoggedIn = await AuthManager.tryAutoLogin(this);
            if (autoLoggedIn) {
                console.log('Auto-login successful, loading servers...');
                await ServerManager.loadServers(this);
                
                // Применяем отложенный инвайт после авторизации
                if (this.pendingInviteCode) {
                    console.log('Applying pending invite:', this.pendingInviteCode);
                    const inviteApplied = await InviteManager.applyPendingInvite();
                    
                    if (inviteApplied) {
                        console.log('Invite applied successfully');
                        this.clearPendingInvite();
                        this.startSyncInterval();
                        return;
                    } else {
                        console.log('Failed to apply invite, continuing with normal flow');
                    }
                }
                
                // Восстанавливаем последний сервер и комнату из localStorage
                const lastServerId = localStorage.getItem('lastServerId');
                const lastRoomId = localStorage.getItem('lastRoomId');
                
                if (lastServerId) {
                    console.log('Found last server in localStorage:', lastServerId);
                    const serverExists = this.servers.some(s => s.id === lastServerId);
                    if (serverExists) {
                        this.currentServerId = lastServerId;
                        this.currentServer = this.servers.find(s => s.id === lastServerId);
                        
                        await RoomManager.loadRoomsForServer(this, lastServerId);
                        
                        // Восстанавливаем последнюю комнату, если она существует
                        if (lastRoomId) {
                            console.log('Found last room in localStorage:', lastRoomId);
                            const roomExists = this.rooms.some(room => room.id === lastRoomId);
                            
                            if (roomExists) {
                                this.currentRoom = lastRoomId;
                                await this.reconnectToRoom(lastRoomId);
                            }
                        }
                        
                        this.startSyncInterval();
                        return;
                    }
                }
                
                // Старая логика для обратной совместимости
                let targetServerId = null;
                if (this.inviteServerId) {
                    console.log('Processing invite server ID:', this.inviteServerId);
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
                    console.log('Processing current server ID:', this.currentServerId);
                    const serverExists = this.servers.some(s => s.id === this.currentServerId);
                    if (serverExists) {
                        targetServerId = this.currentServerId;
                    }
                }
                
                if (targetServerId) {
                    console.log('Setting target server:', targetServerId);
                    this.currentServerId = targetServerId;
                    await RoomManager.loadRoomsForServer(this, targetServerId);
                    if (this.currentRoom) {
                        await this.reconnectToRoom(this.currentRoom);
                    }
                    this.startSyncInterval();
                } else {
                    console.log('No target server found, showing auto-connect UI');
                    this.autoConnect();
                }
                return;
            }
            console.log('No auto-login found, showing auth modal');
            AuthManager.showAuthModal(this);
        } catch (err) {
            console.error('Auto connect error:', err);
            UIManager.showError('Критическая ошибка: не удалось загрузить систему авторизации');
        }
    }

    clearPendingInvite() {
        console.log('Clearing pending invite');
        this.pendingInviteCode = null;
        localStorage.removeItem('pending_invite');
        
        // Очищаем параметр invite из URL
        const url = new URL(window.location);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url);
    }

    async joinServer(serverId) {
        console.log('Joining server:', serverId);
        
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
            }

            if (this.serverSearchInput) {
                this.serverSearchInput.value = '';
            }

            // Сохраняем выбор сервера
            localStorage.setItem('lastServerId', server.id);
            
            ServerManager.renderServers(this);
            this.showPanel('servers');
            
            UIManager.addMessage('System', `✅ Вы присоединились к "${server.name}"`);

            return true;

        } catch (error) {
            console.error('Error joining server:', error);
            UIManager.showError(`❌ Не удалось присоединиться: ${error.message}`);
            return false;
        }
    }

    async joinRoom(roomId) {
        console.log('Joining room:', roomId);
        
        try {
            UIManager.addMessage('System', 'Подключение к комнате...');
            
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
            this.roomType = 'voice';
            
            // Сохраняем выбор сервера и комнаты
            localStorage.setItem('lastServerId', this.currentServerId);
            localStorage.setItem('lastRoomId', this.currentRoom);
            
            this.setupSocketConnection();
            
            await MediaManager.connect(this, roomId, data.mediaData);
            this.updateMicButtonState();
            
            if (this.socket) {
                this.socket.emit('subscribe-to-producers', { roomId });
                this.socket.emit('get-current-producers', { roomId });
            }
            
            UIManager.updateRoomUI(this);
            TextChatManager.joinTextRoom(this, roomId);
            await TextChatManager.loadMessages(this, roomId);
            
            // Используем MembersManager вместо UserPresenceManager
            MembersManager.initializeRoomMembers(this, []);
            
            UIManager.addMessage('System', `✅ Вы присоединились к комнате`);
            return true;
        } catch (e) {
            console.error('Error joining room:', e);
            UIManager.updateStatus('Ошибка: ' + e.message, 'disconnected');
            UIManager.showError('Не удалось присоединиться к комнате: ' + e.message);
            throw e;
        }
    }

    setupSocketConnection() {
        console.log('Setting up socket connection...');
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
        
        this.socket.on('new-producer', async (data) => {
            console.log('New producer event:', data);
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
            console.log('Current producers event:', data);
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
        
        // Настраиваем обработчики MembersManager вместо UserPresenceManager
        MembersManager.setupSocketHandlers(this);
        
        TextChatManager.setupSocketHandlers(this);
        
        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            UIManager.updateStatus('Переподключено', 'connected');
            
            if (this.currentRoom) {
                this.socket.emit('subscribe-to-producers', { roomId: this.currentRoom });
                this.socket.emit('get-current-producers', { roomId: this.currentRoom });
                
                TextChatManager.joinTextRoom(this, this.currentRoom);
            }
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            UIManager.showError('Ошибка соединения: ' + (error.message || 'неизвестная ошибка'));
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            UIManager.updateStatus('Отключено', 'disconnected');
        });
    }

    destroySocket() {
        console.log('Destroying socket connection...');
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
        console.log('Toggling microphone, current state:', this.isMicActive);
        
        try {
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
        console.log('Sending message:', text);
        
        if (!text.trim()) return;
        if (!this.currentRoom) {
            this.showError('Вы не в комнате');
            return;
        }
        
        TextChatManager.sendMessage(this, text).catch((error) => {
            console.error('Error sending message:', error);
            this.showError('Ошибка отправки сообщения');
        });
    }

    startSyncInterval() {
        console.log('Starting sync interval...');
        
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
        console.log('Starting media consumption...');
        
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

    async disconnectFromRoom() {
        console.log('Disconnecting from room:', this.currentRoom);
        
        if (this.currentRoom) {
            MediaManager.disconnect(this);
            
            TextChatManager.leaveTextRoom(this, this.currentRoom);
            
            // Используем MembersManager вместо UserPresenceManager
            MembersManager.clearMembers();
            
            this.destroySocket();
            this.currentRoom = null;
            this.isConnected = false;
            this.isMicActive = false;
            this.existingProducers.clear();
            this.updateMicButtonState();
        }
    }

    async reconnectToRoom(roomId) {
        console.log('Reconnecting to room:', roomId);
        
        try {
            UIManager.addMessage('System', 'Переподключение к комнате...');
            
            this.wasMicActiveBeforeReconnect = this.isMicActive;
            
            if (this.isMicActive && this.mediaData) {
                await MediaManager.stopMicrophone(this);
            }
            
            await this.leaveRoom();
            
            this.isReconnecting = true;
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const result = await this.joinRoom(roomId);
            
            this.isReconnecting = false;
            
            if (this.wasMicActiveBeforeReconnect && this.mediaData) {
                setTimeout(async () => {
                    try {
                        await MediaManager.startMicrophone(this);
                        this.wasMicActiveBeforeReconnect = false;
                    } catch (error) {
                        UIManager.showError('Не удалось восстановить микрофон после переподключения');
                    }
                }, 1000);
            }
            
            return result;
        } catch (error) {
            this.isReconnecting = false;
            UIManager.addMessage('System', 'Ошибка переподключения: ' + error.message);
            throw error;
        }
    }

    async leaveRoom() {
        console.log('Leaving room:', this.currentRoom);
        
        if (!this.currentRoom) return;
        
        try {
            if (this.isConnected) {
                MediaManager.disconnect(this);
            }
            
            await fetch(`${this.API_SERVER_URL}/api/rooms/${this.currentRoom}/leave`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            // Используем MembersManager вместо UserPresenceManager
            MembersManager.clearMembers();
            
            this.currentRoom = null;
            this.roomType = null;
            
            UIManager.updateRoomUI(this);
            UIManager.addMessage('System', `✅ Вы покинули комнату`);
            return true;
        } catch (error) {
            console.error('Error leaving room:', error);
            UIManager.showError('Ошибка при покидании комнаты: ' + error.message);
            return false;
        }
    }

    autoConnect() {
        console.log('Showing auto-connect UI');
        this.sidebar.classList.add('open');
    }

    showMessage(user, text) {
        UIManager.addMessage(user, text);
    }

    showError(text) {
        UIManager.showError(text);
    }

    async searchServers(query) {
        console.log('Searching servers:', query);
        await ServerManager.searchServers(this, query);
    }
}

export default VoiceChatClient;
