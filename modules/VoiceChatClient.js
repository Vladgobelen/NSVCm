import MediaManager from './MediaManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import Utils from './Utils.js';
import TextChatManager from './TextChatManager.js';
import UserPresenceManager from './UserPresenceManager.js';
import InviteManager from './InviteManager.js';
import MembersManager from './MembersManager.js';
import AuthManager from './AuthManager.js';

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
        this.useHttpPolling = false;

        this.elements = {};
        this.debouncedSync = Utils.debounce(() => this.startConsuming(), 1000);

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
        
        this.elements.micButton = document.querySelector('.mic-button');
        this.elements.micToggleBtn = document.querySelector('.mic-toggle-btn');
        this.elements.messageInput = document.querySelector('.message-input');
        this.elements.sendButton = document.querySelector('.send-btn');
        this.elements.currentRoomTitle = document.querySelector('.current-room-title');
        this.elements.toggleSidebarBtn = document.querySelector('.toggle-sidebar-btn');
        this.elements.toggleMembersBtn = document.querySelector('.toggle-members-btn');
        this.elements.settingsBtn = document.querySelector('.settings-btn');
        this.elements.closePanelBtn = document.querySelector('.close-panel-btn');
        this.elements.closeSidebarBtn = document.querySelector('.close-sidebar-btn');
        this.elements.createServerBtn = document.querySelector('.create-server-btn');
        this.elements.createRoomBtn = document.querySelector('.create-room-btn');
        this.elements.serversToggleBtn = document.querySelector('#serversToggle');
        this.elements.roomsToggleBtn = document.querySelector('#roomsToggle');
        this.elements.serversList = document.querySelector('.servers-list');
        this.elements.roomsList = document.querySelector('.rooms-list');
        this.elements.membersList = document.querySelector('.members-list');
        this.elements.messagesContainer = document.querySelector('.messages-container');
        this.elements.serversPanel = document.getElementById('servers-panel'); 
        this.elements.roomsPanel = document.getElementById('rooms-panel'); 
        this.elements.sidebar = document.querySelector('.sidebar');
        this.elements.membersPanel = document.querySelector('.members-panel');
        this.elements.serverSearchInput = document.querySelector('#serverSearch');
        this.elements.clearSearchBtn = document.querySelector('#clearSearchBtn');    
        
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.addEventListener('click', () => {
                ServerManager.clearSearchAndShowAllServers(this);
            });
        } else {
            console.warn('Clear search button not found');
        }
    }

    initEventListeners() {
        console.log('Setting up event listeners...');
        
        if (this.elements.micButton) {
            this.elements.micButton.addEventListener('click', () => this.toggleMicrophone());
        }
        
        if (this.elements.micToggleBtn) {
            this.elements.micToggleBtn.addEventListener('click', () => this.toggleMicrophone());
        }
        
        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('keypress', e => {
                if (e.key === 'Enter') {
                    this.sendMessage(this.elements.messageInput.value);
                    this.elements.messageInput.value = '';
                }
            });
        }
        
        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', () => {
                this.sendMessage(this.elements.messageInput.value);
                this.elements.messageInput.value = '';
            });
        }
        
        if (this.elements.toggleSidebarBtn) {
            this.elements.toggleSidebarBtn.addEventListener('click', () => {
                this.elements.sidebar.classList.toggle('open');
            });
        }
        
        if (this.elements.toggleMembersBtn) {
            this.elements.toggleMembersBtn.addEventListener('click', () => {
                this.elements.membersPanel.classList.toggle('open');
            });
        }
        
        if (this.elements.closePanelBtn) {
            this.elements.closePanelBtn.addEventListener('click', () => {
                this.elements.membersPanel.classList.remove('open');
            });
        }
        
        if (this.elements.closeSidebarBtn) {
            this.elements.closeSidebarBtn.addEventListener('click', () => {
                this.elements.sidebar.classList.remove('open');
            });
        }
        
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.addEventListener('click', () => {
                UIManager.openSettings(this);
            });
        }
        
        if (this.elements.createServerBtn) {
            this.elements.createServerBtn.addEventListener('click', () => {
                ServerManager.createServer(this);
            });
        }

        if (this.elements.createRoomBtn) {
            this.elements.createRoomBtn.addEventListener('click', () => {
                if (!this.currentServerId) {
                    alert('Сначала выберите сервер');
                    return;
                }
                
                UIManager.openCreateRoomModal(this, (name) => {
                    RoomManager.createRoom(this, this.currentServerId, name);
                });
            });
        }

        if (this.elements.serversToggleBtn) {
            this.elements.serversToggleBtn.addEventListener('click', () => {
                ServerManager.clearSearchAndShowAllServers(this);
                this.showPanel('servers');
            });
        }
        
        if (this.elements.roomsToggleBtn) {
            this.elements.roomsToggleBtn.addEventListener('click', () => {
                this.showPanel('rooms');
            });
        }
        
        if (this.elements.serverSearchInput) {
            this.elements.serverSearchInput.addEventListener('input', (e) => {
                this.searchServers(e.target.value);
            });
        }
    }

    showPanel(panelName) {
        console.log('Showing panel:', panelName);
        
        const serversPanel = this.elements.serversPanel;
        const roomsPanel = this.elements.roomsPanel;
        const serversToggleBtn = this.elements.serversToggleBtn;
        const roomsToggleBtn = this.elements.roomsToggleBtn;
    
        if (!serversPanel || !roomsPanel || !serversToggleBtn || !roomsToggleBtn) {
            console.error('Required panel elements not found');
            return;
        }
    
        this.activePanel = panelName;
    
        if (panelName === 'servers') {
            serversToggleBtn.classList.add('active');
            roomsToggleBtn.classList.remove('active');
            serversPanel.classList.add('active');
            roomsPanel.classList.remove('active');
        } else {
            serversToggleBtn.classList.remove('active');
            roomsToggleBtn.classList.add('active');
            serversPanel.classList.remove('active');
            roomsPanel.classList.add('active');
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
                
                const lastServerId = localStorage.getItem('lastServerId');
                const lastRoomId = localStorage.getItem('lastRoomId');
                
                if (lastServerId) {
                    console.log('Found last server in localStorage:', lastServerId);
                    const serverExists = this.servers.some(s => s.id === lastServerId);
                    if (serverExists) {
                        this.currentServerId = lastServerId;
                        this.currentServer = this.servers.find(s => s.id === lastServerId);
                        
                        await RoomManager.loadRoomsForServer(this, lastServerId);
                        
                        if (lastRoomId) {
                            console.log('Found last room in localStorage:', lastRoomId);
                            const roomExists = this.rooms.some(room => room.id === lastRoomId);
                            
                            if (roomExists) {
                                this.currentRoom = lastRoomId;
                                await this.reconnectToRoom(lastRoomId);
                                this.startSyncInterval();
                                return;
                            }
                        }
                    }
                }
                
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

            if (this.elements.serverSearchInput) {
                this.elements.serverSearchInput.value = '';
            }

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
    

if (this.currentRoom === roomId && this.isConnected) {
        console.log('Already connected to this room, updating state');
        await this.startConsuming();
        return true;
    }

    
        try {
            UIManager.addMessage('System', 'Подключение к комнате...');
            
            this.disconnectFromRoom();
            
            this.setupSocketConnection();
            
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
            
            // Добавляем проверку mediaData
            if (!data.mediaData) {
                throw new Error('No media data received from server');
            }
            
            this.clientID = data.clientId;
            this.mediaData = data.mediaData;
            this.currentRoom = roomId;
            this.roomType = 'voice';
            
            localStorage.setItem('lastServerId', this.currentServerId);
            localStorage.setItem('lastRoomId', this.currentRoom);
            this.audioProducer = null;
            await MediaManager.connect(this, roomId, data.mediaData);
            this.updateMicButtonState();
            
            if (this.socket) {
                this.socket.emit('subscribe-to-producers', { roomId });
                this.socket.emit('get-current-producers', { roomId });
            }
            
            UIManager.updateRoomUI(this);
            TextChatManager.joinTextRoom(this, roomId);
            await TextChatManager.loadMessages(this, roomId);
            
            try {
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const participantsResponse = await fetch(`${this.API_SERVER_URL}/api/media/rooms/${roomId}/participants`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (participantsResponse.ok) {
                    const participantsData = await participantsResponse.json();
                    if (participantsData.participants && Array.isArray(participantsData.participants)) {
                        console.log('[CLIENT] Инициализируем список участников с', participantsData.participants.length, 'участниками');
                        MembersManager.initializeRoomMembers(this, participantsData.participants);
                    } else {
                        console.log('[CLIENT] Пустой или некорректный список участников от сервера');
                    }
                } else {
                    console.error('[CLIENT] Ошибка при получении списка участников:', participantsResponse.status);
                }
            } catch (error) {
                console.error('[CLIENT] Ошибка запроса списка участников:', error);
            }
            
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
        
        if (this.socket && this.socket.connected) {
            console.log('Socket already connected, reusing');
            return;
        }
        
        const currentToken = this.token;
        if (!currentToken) {
            console.log('No token available, skipping socket connection');
            return;
        }

        this.destroySocket();
        
        try {
            console.log('Creating new socket connection with token:', currentToken);
            this.socket = io(this.API_SERVER_URL, {
                auth: {
                    token: currentToken,
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

            const socket = this.socket;
            
socket.on('new-producer', async (data) => {
    // 🔴🔴🔴 АГРЕССИВНЫЙ ДЕБАГ: Логируем ВСЁ
    console.group('🔴🔴🔴 [DEBUG] SOCKET EVENT: new-producer');
    console.log('🎯 [DEBUG] EVENT DATA RECEIVED:', JSON.stringify(data, null, 2));
    console.log('🎯 [DEBUG] CLIENT STATE - clientID:', this.clientID);
    console.log('🎯 [DEBUG] CLIENT STATE - existingProducers (BEFORE):', Array.from(this.existingProducers));
    console.log('🎯 [DEBUG] CLIENT STATE - isConnected:', this.isConnected);
    console.log('🎯 [DEBUG] CLIENT STATE - currentRoom:', this.currentRoom);
    console.log('🎯 [DEBUG] CHECK: Is this my own producer?', data.clientID === this.clientID);
    console.log('🎯 [DEBUG] CHECK: Is producer already in existingProducers?', this.existingProducers.has(data.producerId));
    console.groupEnd();

    // Оригинальная логика с дебагом
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('🎯 New producer event:', data);

    // Проверка: не свой ли это продюсер
    if (data.clientID !== this.clientID) {
        console.log('🎧 [DEBUG] Attempting to create consumer for producer:', data.producerId);
        try {
            await MediaManager.createConsumer(this, data.producerId);
            this.existingProducers.add(data.producerId);
            console.log('✅ [DEBUG] Consumer created and producerId added to existingProducers:', data.producerId);
        } catch (error) {
            console.error('❌ Error creating consumer:', error);
            // Добавляем дебаг даже при ошибке
            console.log('❌ [DEBUG] Consumer creation FAILED for producer:', data.producerId);
        }
    } else {
        console.log('🔇 [DEBUG] Ignoring own producer:', data.producerId);
    }

    // 🔴🔴🔴 АГРЕССИВНЫЙ ДЕБАГ: Логируем состояние ПОСЛЕ обработки
    console.group('🔴🔴🔴 [DEBUG] AFTER PROCESSING new-producer');
    console.log('🎯 [DEBUG] CLIENT STATE - existingProducers (AFTER):', Array.from(this.existingProducers));
    console.groupEnd();
});
            socket.on('current-producers', async (data) => {
                console.log('🎯 Current producers event:', data);
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
                            console.error('❌ Error creating consumer:', error);
                            if (error.message.includes('consume own')) {
                                this.existingProducers.add(producer.id);
                            }
                        }
                    }
                }
            });

            socket.on('room-participants', (participants) => {
                console.log('Room participants received:', participants);
                MembersManager.updateAllMembers(participants);
            });

            socket.on('user-joined', (user) => {
                console.log('User joined:', user);
                MembersManager.addMember(user);
                UIManager.addMessage('System', `Пользователь ${user.username} присоединился к комнате`);
            });

            socket.on('user-left', (data) => {
                console.log('User left:', data);
                MembersManager.removeMember(data.userId);
                UIManager.addMessage('System', `Пользователь покинул комнату`);
            });

            socket.on('user-mic-state', (data) => {
                console.log('User mic state changed:', data);
                if (data.userId) {
                    MembersManager.updateMember(data.userId, { isMicActive: data.isActive });
                } else {
                    const members = MembersManager.getMembers();
                    const member = members.find(m => m.clientId === data.clientID);
                    if (member) {
                        MembersManager.updateMember(member.userId, { isMicActive: data.isActive });
                    }
                }
            });

            socket.on('new-message', (message) => {
                console.log('New message received:', message);
                if (message.roomId === this.currentRoom) {
                    UIManager.addMessage(message.username, message.text, message.timestamp);
                }
            });

            socket.on('message-history', (data) => {
                console.log('Message history received:', data);
                if (data.roomId === this.currentRoom && data.messages) {
                    UIManager.clearMessages();
                    
                    data.messages.forEach(msg => {
                        UIManager.addMessage(msg.username, msg.text, msg.timestamp);
                    });
                }
            });

            socket.on('error', (error) => {
                console.error('Socket error:', error);
                UIManager.showError('Ошибка соединения: ' + (error.message || 'неизвестная ошибка'));
            });

            socket.on('connect', () => {
                console.log('✅ Socket connected with ID:', socket.id);
                UIManager.updateStatus('Подключено', 'connected');
                
                if (this.currentRoom) {
                    console.log('Rejoining room after socket reconnect:', this.currentRoom);
                    socket.emit('join-room', { roomId: this.currentRoom });
                    socket.emit('subscribe-to-producers', { roomId: this.currentRoom });
                    socket.emit('get-current-producers', { roomId: this.currentRoom });
                }
            });

            socket.on('disconnect', (reason) => {
                console.log('Socket disconnected:', reason);
                UIManager.updateStatus('Отключено', 'disconnected');
            });

        } catch (error) {
            console.error('Error setting up socket connection:', error);
            UIManager.showError('Ошибка подключения к серверу');
        }
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
            // Пытаемся отключить микрофон через отключение трека
            const disabled = await MediaManager.disableMicrophone(this);
            
            if (!disabled) {
                // Если не удалось отключить трек, полностью останавливаем микрофон
                await MediaManager.stopMicrophone(this, false); // false = не закрывать transport
            }
            
            if (this.socket) {
                this.socket.emit('mic-state-change', {
                    roomId: this.currentRoom,
                    isActive: false,
                    clientID: this.clientID,
                    userId: this.userId
                });
            }
        } else {
            try {
                // Пытаемся включить микрофон через включение трека
                const enabled = await MediaManager.enableMicrophone(this);
                
                if (!enabled) {
                    // Если не удалось включить трек, запускаем микрофон полностью
                    if (!this.sendTransport && this.mediaData) {
                        await MediaManager.connect(this, this.currentRoom, this.mediaData);
                    }
                    await MediaManager.startMicrophone(this);
                }
                
                if (this.socket) {
                    this.socket.emit('mic-state-change', {
                        roomId: this.currentRoom,
                        isActive: true,
                        clientID: this.clientID,
                        userId: this.userId
                    });
                    
                    if (this.audioProducer) {
                        this.socket.emit('new-producer-notification', {
                            roomId: this.currentRoom,
                            producerId: this.audioProducer.id,
                            clientID: this.clientID,
                            kind: 'audio'
                        });
                    }
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
        
        if (this.socket) {
            this.socket.emit('send-message', {
                roomId: this.currentRoom,
                text: text.trim()
            });
        } else {
            TextChatManager.sendMessage(this, text).catch((error) => {
                console.error('Error sending message:', error);
                this.showError('Ошибка отправки сообщения');
            });
        }
    }

    startSyncInterval() {
        console.log('Starting sync interval...');

        window.debugStartConsuming = () => this.startConsuming();
        window.debugStartSyncInterval = () => this.startSyncInterval();
        window.debugVoiceClient = this;
           
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
        }, 5000); // Увеличен интервал до 5 секунд для снижения нагрузки
    }

    async startConsuming() {
        console.log('🔄 Starting media consumption...');
        
        if (!this.isConnected || !this.currentRoom) {
            console.log('Not connected or no room, skipping consumption');
            return;
        }
        
        try {
            // Добавляем параметр timestamp для предотвращения кэширования
            const timestamp = Date.now();
            const response = await fetch(`${this.API_SERVER_URL}/api/media/rooms/${this.currentRoom}/producers?t=${timestamp}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });
            
            if (!response.ok) {
                console.error(`❌ HTTP error! status: ${response.status}`);
                return;
            }
            
            const data = await response.json();
            const producers = data.producers || [];
            console.log(`📋 Found ${producers.length} producers in room ${this.currentRoom}`);

            for (const producer of producers) {
                if (producer.clientID !== this.clientID && !this.existingProducers.has(producer.id)) {
                    try {
                        await MediaManager.createConsumer(this, producer.id);
                        this.existingProducers.add(producer.id);
                        console.log(`🎧 Created consumer for producer: ${producer.id}`);
                    } catch (error) {
                        console.error('❌ Error creating consumer:', error);
                        if (error.message.includes('consume own')) {
                            this.existingProducers.add(producer.id);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error starting consuming:', error);
        }
    }

    async disconnectFromRoom() {
        console.log('Disconnecting from room:', this.currentRoom);
        
        if (this.currentRoom) {
            if (this.socket) {
                this.socket.emit('leave-room', { roomId: this.currentRoom });
            }
            
            MediaManager.disconnect(this);
            
            TextChatManager.leaveTextRoom(this, this.currentRoom);
            
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
                        // Добавляем принудительное обновление продюсеров
                        setTimeout(() => {
                            this.forceRefreshProducers();
                        }, 2000);
                    } catch (error) {
                        console.error('Failed to restart microphone after reconnect:', error);
                        UIManager.showError('Не удалось восстановить микрофон после переподключения');
                    }
                }, 3000); // Увеличиваем задержку до 3 секунд
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
            if (this.socket) {
                this.socket.emit('leave-room', { roomId: this.currentRoom });
            }
            
            if (this.isConnected) {
                MediaManager.disconnect(this);
            }
            
            await fetch(`${this.API_SERVER_URL}/api/media/rooms/${this.currentRoom}/leave`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            MembersManager.clearMembers();
            
            this.currentRoom = null;
            this.roomType = null;
            
            UIManager.updateRoomUI(this);
            UIManager.addMessage('System', `✅ Вы покинули комнату`);
            return true;
        } catch (error) {
            console.error('Error leaving room:', error);
            UIManager.showError('Ошибка при покидании комната: ' + error.message);
            return false;
        }
    }

    autoConnect() {
        console.log('Showing auto-connect UI');
        this.elements.sidebar.classList.add('open');
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

    async checkRoomState() {
        if (!this.currentRoom) {
            console.log('No current room to check');
            return;
        }
        
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/debug/room/${this.currentRoom}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
        if (response.ok) {
            const roomState = await response.json();
            console.log('🏠 Room state:', roomState);
            
            const ourTransport = roomState.transports.find(t => t.clientID === this.clientID && t.direction === 'recv');
            console.log('📡 Our receive transport:', ourTransport);
            
            const ourConsumers = roomState.consumers.filter(c => c.clientID === this.clientID);
            console.log('🎧 Our consumers:', ourConsumers);
            
            return roomState;
        } else {
            console.error('Failed to get room state:', response.status);
        }
    } catch (error) {
        console.error('Error checking room state:', error);
    }
}

// Добавляем функцию для принудительного обновления продюсеров
async forceRefreshProducers() {
    try {
        console.log('🔄 Force refreshing producers...');
        const timestamp = Date.now();
        const response = await fetch(`${this.API_SERVER_URL}/api/media/rooms/${this.currentRoom}/producers/force?t=${timestamp}`, {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const producers = data.producers || [];
        console.log(`📋 Force refresh found ${producers.length} producers`);
        
        for (const producer of producers) {
            if (producer.clientID !== this.clientID && !this.existingProducers.has(producer.id)) {
                try {
                    await MediaManager.createConsumer(this, producer.id);
                    this.existingProducers.add(producer.id);
                    console.log(`🎧 Created consumer for producer: ${producer.id}`);
                } catch (error) {
                    console.error('❌ Error creating consumer:', error);
                    if (error.message.includes('consume own')) {
                        this.existingProducers.add(producer.id);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error force refreshing producers:', error);
    }
}
}

// Добавляем функцию в глобальную область видимости для отладки
window.debugForceRefresh = () => {
    if (window.debugVoiceClient) {
        window.debugVoiceClient.forceRefreshProducers();
    } else {
        console.error('Voice client not available for debugging');
    }
};

export default VoiceChatClient;
