// modules/VoiceChatClient.js
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
import VolumeBoostManager from './VolumeBoostManager.js';

class VoiceChatClient {
    constructor() {
        this.API_SERVER_URL = 'https://ns.fiber-gate.ru';
        this.CHAT_API_URL = `${this.API_SERVER_URL}/api/join`;
        this.clientID = Utils.generateClientID();
        this.device = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.audioProducer = null;
        window.voiceClient = this;
        this.consumerState = new Map();
        this.stream = null;
        this.isMicActive = false;
        this.currentRoom = null;
        this.currentServerId = null;
        this.currentServer = null;
        this.servers = [];
        this.rooms = [];
        this.keepAliveInterval = null;
        this.pingInterval = null;
        this.bitrate = 32000;
        this.dtxEnabled = true;
        this.fecEnabled = true;
        this.isConnected = false;
        this.mediaData = null;
        this.userId = null;
        this.token = null;
        this.username = null;
        this.tokenVersion = 1;
        this.syncInterval = null;
        this.activePanel = 'servers';
        this.inviteServerId = null;
        this.isCreatingRoom = false;
        this.socket = null;
        this.sseConnection = null;
        this.wasMicActiveBeforeReconnect = false;
        this.isReconnecting = false;
        this.pendingInviteCode = null;
        this.useHttpPolling = false;
        this.elements = {};
        this.debouncedSync = Utils.debounce(() => this.startConsuming(), 1000);
        this.socketRoom = null;
        this.existingProducers = new Set();
        this._joiningRoomMessageShown = false;
        this._joinSuccessShown = false;
        this._reconnectInProgress = false;
        this._joinRoomInProgress = false;
        this._autoConnectDone = false;
        this._reconnectMessageShown = false;
        this.init();
    }

    playSound(soundName) {
        if (typeof Audio === 'undefined') return;
        const audio = new Audio(`/sounds/${soundName}.mp3`);
        audio.volume = 0.1;
        audio.play().catch((err) => {
            // Sound play error ignored
        });
    }

    async init() {
        this.initElements();
        this.initEventListeners();
        UIManager.setClient(this);
        UserPresenceManager.init(this);
        InviteManager.init(this);
        await this.initAutoConnect();
        this.initMessageReadObserver();
    }

    initElements() {
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
        this.elements.backBtn = document.querySelector('.back-btn');
        this.elements.pttSetupBtn = document.querySelector('.ptt-setup-btn');
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.addEventListener('click', () => {
                ServerManager.clearSearchAndShowAllServers(this);
            });
        }
    }

    initEventListeners() {
        const userGestureHandler = () => {
            VolumeBoostManager.resume();
            document.removeEventListener('click', userGestureHandler, { once: true });
            document.removeEventListener('touchstart', userGestureHandler, { once: true });
        };
        document.addEventListener('click', userGestureHandler, { once: true });
        document.addEventListener('touchstart', userGestureHandler, { once: true });

        if (this.elements.micButton) {
            this.elements.micButton.addEventListener('click', () => this.toggleMicrophone());
        }
        if (this.elements.micToggleBtn) {
            this.elements.micToggleBtn.addEventListener('click', () => this.toggleMicrophone());
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('keypress', (e) => {
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
                if (this.elements.sidebar.classList.contains('open')) {
                    this.elements.membersPanel.classList.remove('open');
                }
            });
        }
        if (this.elements.toggleMembersBtn) {
            this.elements.toggleMembersBtn.addEventListener('click', () => {
                this.elements.membersPanel.classList.toggle('open');
                if (this.elements.membersPanel.classList.contains('open')) {
                    this.elements.sidebar.classList.remove('open');
                }
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
                    UIManager.showError('Сначала выберите сервер');
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

        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.addEventListener('click', (e) => {
                if (
                    !e.target.closest('.message-input') &&
                    !e.target.closest('.send-btn') &&
                    !e.target.closest('.mic-toggle-btn') &&
                    !e.target.closest('.settings-btn') &&
                    !e.target.closest('.toggle-members-btn') &&
                    !e.target.closest('.current-room-title') &&
                    !e.target.closest('.toggle-sidebar-btn') &&
                    !e.target.closest('.attach-btn')
                ) {
                    this.elements.sidebar.classList.remove('open');
                    this.elements.membersPanel.classList.remove('open');
                }
            });
        }

        const unlockBtn = document.getElementById('audio-unlock-btn');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => {
                const audio = new Audio();
                audio.muted = true;
                audio.playsInline = true;
                audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAA=';
                audio.play().then(() => {
                    unlockBtn.style.display = 'none';
                }).catch(() => {
                    // Audio unlock failed
                });
            });
        }

        if (mainContent) {
            mainContent.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                mainContent.classList.add('drag-over');
            });
            mainContent.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                mainContent.classList.remove('drag-over');
            });
            mainContent.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                mainContent.classList.remove('drag-over');
                if (!this.currentRoom) {
                    UIManager.showError('Сначала войдите в комнату');
                    return;
                }
                const files = e.dataTransfer.files;
                if (files.length === 0) return;
                const file = files[0];
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                    UIManager.showError('Поддерживаются только изображения: JPEG, PNG, WebP');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    UIManager.showError('Файл слишком большой (макс. 5 МБ)');
                    return;
                }
                try {
                    const imageUrl = await TextChatManager.uploadImage(this, this.currentRoom, file);
                    await TextChatManager.sendMessage(this, imageUrl, 'image');
                } catch (error) {
                    UIManager.showError('Не удалось отправить изображение: ' + error.message);
                }
            });
        }

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/jpeg,image/png,image/webp';
        fileInput.style.display = 'none';
        fileInput.id = 'image-upload-input';
        document.body.appendChild(fileInput);
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!this.currentRoom) {
                UIManager.showError('Сначала войдите в комнату');
                return;
            }
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                UIManager.showError('Поддерживаются только изображения: JPEG, PNG, WebP');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                UIManager.showError('Файл слишком большой (макс. 5 МБ)');
                return;
            }
            try {
                const imageUrl = await TextChatManager.uploadImage(this, this.currentRoom, file);
                await TextChatManager.sendMessage(this, imageUrl, 'image');
            } catch (error) {
                UIManager.showError('Не удалось отправить изображение: ' + error.message);
            } finally {
                fileInput.value = '';
            }
        });

        const attachBtn = document.querySelector('.attach-btn');
        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }
    }

    initMessageReadObserver() {
        this.unreadMessageIds = new Set();
        this.messageObserver = new IntersectionObserver(
            (entries) => {
                const toMark = [];
                entries.forEach((entry) => {
                    const msgId = entry.target.dataset.messageId;
                    if (!msgId) return;
                    const readBy = JSON.parse(entry.target.dataset.readBy || '[]');
                    const isOwn = entry.target.querySelector('.message-content.own');
                    if (isOwn) return;
                    if (entry.isIntersecting && !readBy.includes(this.userId)) {
                        toMark.push(msgId);
                        this.unreadMessageIds.delete(msgId);
                    } else if (!entry.isIntersecting) {
                        this.unreadMessageIds.add(msgId);
                    }
                });
                if (toMark.length > 0) {
                    TextChatManager.markMessagesAsRead(this, toMark);
                    this.clearUnreadForCurrentRoom();
                }
            },
            { threshold: 0.5 }
        );
    }

    showPanel(panelName) {
        const serversPanel = this.elements.serversPanel;
        const roomsPanel = this.elements.roomsPanel;
        const serversToggleBtn = this.elements.serversToggleBtn;
        const roomsToggleBtn = this.elements.roomsToggleBtn;
        if (!serversPanel || !roomsPanel || !serversToggleBtn || !roomsToggleBtn) {
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
        const params = new URLSearchParams(window.location.search);
        this.currentServerId = params.get('server');
        this.currentRoom = params.get('room');
        this.inviteServerId = params.get('invite');
        const inviteCode = params.get('invite');
        if (inviteCode && /^[a-zA-Z0-9]{4,6}$/.test(inviteCode)) {
            const storedInvite = localStorage.getItem('pending_invite');
            if (storedInvite && storedInvite !== inviteCode) {
                localStorage.removeItem('pending_invite');
            }
            this.pendingInviteCode = inviteCode;
            InviteManager.setPendingInvite(inviteCode);
        }
    }

    async ensureConsumer(producerId, producerData = {}) {
        const currentState = this.consumerState.get(producerId);
        if (currentState?.status === 'active') {
            return true;
        }
        if (currentState?.status === 'creating') {
            return false;
        }
        if (producerData.clientID && producerData.clientID === this.clientID) {
            this.consumerState.set(producerId, {
                status: 'own-producer',
                consumer: null,
                lastError: null
            });
            return false;
        }
        this.consumerState.set(producerId, { status: 'creating', consumer: null, lastError: null });
        try {
            const consumer = await MediaManager.createConsumer(this, producerId, 3, producerData);
            this.consumerState.set(producerId, { status: 'active', consumer: consumer, lastError: null });
            return true;
        } catch (error) {
            this.consumerState.set(producerId, {
                status: 'error',
                consumer: null,
                lastError: error
            });
            if (error.message.includes('consume own') || error.message.includes('own audio')) {
                this.consumerState.set(producerId, {
                    status: 'own-producer',
                    consumer: null,
                    lastError: null
                });
            }
            return false;
        }
    }

    async initAutoConnect() {
        this.processUrlParams();
        try {
            const autoLoggedIn = await AuthManager.tryAutoLogin(this);
            if (autoLoggedIn) {
                console.log(`✅ [CLIENT] Авто-логин: userId=${this.userId}, username=${this.username}, tokenVersion=${this.tokenVersion}`);
                await ServerManager.loadServers(this);
                await UIManager.fetchUsernames([this.userId]);
                if (this.pendingInviteCode || InviteManager.getPendingInvite()) {
                    const inviteApplied = await InviteManager.applyPendingInvite();
                    if (inviteApplied) {
                        this.clearPendingInvite();
                        return;
                    }
                    this.clearPendingInvite();
                }
                const lastServerId = localStorage.getItem('lastServerId');
                const lastRoomId = localStorage.getItem('lastRoomId');
                if (lastServerId) {
                    const serverExists = this.servers.some((s) => s.id === lastServerId);
                    if (serverExists) {
                        this.currentServerId = lastServerId;
                        this.currentServer = this.servers.find((s) => s.id === lastServerId);
                        await RoomManager.loadRoomsForServer(this, lastServerId);
                        if (lastRoomId) {
                            const roomExists = this.rooms?.some((room) => room.id === lastRoomId);
                            if (roomExists) {
                                this.currentRoom = lastRoomId;
                                await this.reconnectToRoom(lastRoomId);
                                return;
                            }
                        }
                    }
                }
                return;
            }
            console.log(`ℹ️ [CLIENT] Авто-логин не удался, показываем форму`);
            AuthManager.showAuthModal(this);
        } catch (err) {
            console.error('initAutoConnect error:', err);
            UIManager.showError('Критическая ошибка: не удалось загрузить систему авторизации');
        }
    }

    clearPendingInvite() {
        this.pendingInviteCode = null;
        localStorage.removeItem('pending_invite');
        const url = new URL(window.location);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url);
    }

    async joinServer(serverId) {
        try {
            const res = await fetch(`${this.API_SERVER_URL}/api/servers/${serverId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    userId: this.userId,
                    token: this.token
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Не удалось присоединиться');
            }
            const data = await res.json();
            const server = data.server;
            const exists = this.servers.some((s) => s.id === server.id);
            if (!exists) {
                this.servers.push(server);
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
            UIManager.showError(`❌ Не удалось присоединиться: ${error.message}`);
            return false;
        }
    }

    async joinRoom(roomId, clearUnread = true) {
        if (this.currentRoom === roomId && this.isConnected && this.socket?.connected) {
            await this.startConsuming();
            return true;
        }
        try {
            if (!this._joiningRoomMessageShown) {
                UIManager.addMessage('System', 'Подключение к комнате...');
                this._joiningRoomMessageShown = true;
            }
            if (this.currentRoom && this.currentRoom !== roomId) {
                if (this.socket) {
                    this.socket.emit('leave-room', { roomId: this.currentRoom });
                }
            }
            this.disconnectFromRoom();
            const res = await fetch(this.CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
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
            if (!data.mediaData) throw new Error('No media data received from server');
            this.clientID = data.clientId;
            this.mediaData = data.mediaData;
            this.currentRoom = roomId;
            this.roomType = 'voice';
            localStorage.setItem('lastServerId', this.currentServerId);
            localStorage.setItem('lastRoomId', this.currentRoom);
            this.audioProducer = null;
            this.consumerState.clear();
            this.existingProducers.clear();
            await MediaManager.connect(this, roomId, data.mediaData);
            this.setupSocketConnection();
            this.updateMicButtonState();
            if (this.socket) {
                this.socket.emit('subscribe-to-producers', { roomId });
                this.socket.emit('get-current-producers', { roomId });
            }
            UIManager.updateRoomUI(this);
            if (RoomManager.isPrivateRoom(roomId)) {
                const displayName = RoomManager.getPrivateRoomDisplayName(roomId, this.userId, this.currentServer);
                if (displayName) {
                    UIManager.updateRoomTitle(`👤 ${displayName}`);
                }
            }
            TextChatManager.joinTextRoom(this, roomId);
            await TextChatManager.loadMessages(this, roomId);
            if (clearUnread) {
                await this.clearUnreadForCurrentRoom();
            }
            const connectionValid = await this._validateRoomConnection(roomId);
            if (!connectionValid) {
                console.warn('⚠️ Room validation failed, but continuing anyway');
            }
            if (this.currentRoom === roomId && !this._joinSuccessShown) {
                UIManager.addMessage('System', `✅ Вы присоединились к комнате`);
                this._joinSuccessShown = true;
            }
            if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                const btn = document.getElementById('ios-audio-unlock');
                if (btn) btn.style.display = 'block';
            }
            return true;
        } catch (e) {
            this._joiningRoomMessageShown = false;
            this._joinSuccessShown = false;
            UIManager.updateStatus('Ошибка: ' + e.message, 'disconnected');
            UIManager.showError('Не удалось присоединиться к комнате: ' + e.message);
            throw e;
        }
    }

    async clearUnreadForCurrentRoom() {
        if (!this.currentRoom) {
            return;
        }
        let serverId = this.currentServerId;
        if (!serverId || this.currentServer?.type === 'direct' || this.currentServerId?.startsWith('user_')) {
            serverId = this.currentRoom;
        }
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/messages/${this.currentRoom}/mark-read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`
                },
                body: JSON.stringify({ serverId: serverId })
            });
            if (response.ok) {
                UIManager.clearUnreadForRoom(serverId, this.currentRoom);
                console.log(`📬 [CLIENT] Unread cleared for room ${this.currentRoom}`);
            }
        } catch (error) {
            console.error('Error clearing unread:', error);
        }
    }

    async _validateRoomConnection(roomId) {
        if (this.currentRoom !== roomId) {
            return false;
        }
        if (!this.isConnected) {
            return false;
        }
        if (!this.socket || !this.socket.connected) {
            return false;
        }
        if (!this.mediaData) {
            return false;
        }
        if (!this.sendTransport || !this.recvTransport) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
            const response = await fetch(
                `${this.API_SERVER_URL}/api/media/rooms/${roomId}/producers`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                }
            );
            if (!response.ok) {
                return false;
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    setupSocketConnection() {
        const currentToken = this.token;
        if (!currentToken) {
            return;
        }
        if (this.socket && this.socket.connected) {
            if (this.currentRoom && this.socketRoom !== this.currentRoom) {
                this.destroySocket();
            } else {
                this.socket.emit('join-room', { roomId: this.currentRoom });
                this.socket.emit('subscribe-to-producers', { roomId: this.currentRoom });
                this.socket.emit('get-current-producers', { roomId: this.currentRoom });
                return;
            }
        }
        this.destroySocket();
        try {
            this.socket = io(this.API_SERVER_URL, {
                auth: {
                    token: currentToken,
                    userId: this.userId,
                    clientId: this.clientID,
                    username: this.username,
                    tokenVersion: this.tokenVersion
                },
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000
            });
            this.socketRoom = this.currentRoom;
            const socket = this.socket;

            socket.on('unread-update', (data) => {
                console.log('📬 [CLIENT] Unread update received:', data);
                UIManager.setUnreadCount(
                    data.serverId,
                    data.roomId,
                    data.count,
                    data.hasMention,
                    data.personalCount || 0
                );
            });

            socket.on('room-participants-updated', (data) => {
                console.log('👥 Room participants updated:', data);
                MembersManager.updateAllMembersWithStatus(data.online, data.offline);
            });

            socket.on('new-producer', async (data) => {
                if (data.producerId && data.clientID) {
                    if (!window.producerClientMap) window.producerClientMap = new Map();
                    window.producerClientMap.set(data.producerId, data.clientID);
                    if (typeof MembersManager !== 'undefined') {
                        const members = MembersManager.getMembers();
                        const member = members.find((m) => m.clientId === data.clientID);
                        if (member?.userId) {
                            if (!window.producerUserMap) window.producerUserMap = new Map();
                            window.producerUserMap.set(data.producerId, member.userId);
                        }
                    }
                }
                if (data.clientID !== this.clientID) {
                    await this.ensureConsumer(data.producerId, data);
                } else {
                    this.consumerState.set(data.producerId, {
                        status: 'own-producer',
                        consumer: null,
                        lastError: null
                    });
                }
            });

            socket.on('current-producers', async (data) => {
                if (!data || !data.producers || !Array.isArray(data.producers)) {
                    return;
                }
                for (const producer of data.producers) {
                    if (producer.clientID !== this.clientID) {
                        await this.ensureConsumer(producer.id, producer);
                    } else {
                        this.consumerState.set(producer.id, {
                            status: 'own-producer',
                            consumer: null,
                            lastError: null
                        });
                    }
                }
            });

            socket.on('room-participants', (participants) => {
                const processedParticipants = participants.map((p) => {
                    if (p.userId === this.userId) {
                        return { ...p, isOnline: true };
                    }
                    return p;
                });
                MembersManager.updateAllMembers(processedParticipants);
                const me = processedParticipants.find((p) => p.userId);
                if (me) {
                    window.voiceClient.userId = me.userId;
                    const displayName = me.username || me.name || me.userId;
                    if (typeof window.setLoggerDisplayName === 'function') {
                        window.setLoggerDisplayName(displayName);
                    }
                }
            });

            socket.on('user-joined', (user) => {
                UIManager.addMessage('System', `Пользователь ${user.username} присоединился к комнате`);
                this.playSound('user-join');
            });

            socket.on('user-left', async (data) => {
                const member = MembersManager.getMember(data.userId);
                const memberElement = document.querySelector(`.member-item[data-user-id="${data.userId}"]`);
                if (memberElement) {
                    const slider = memberElement.querySelector('.member-volume-slider');
                    if (slider) {
                        slider.style.display = 'none';
                        slider.dataset.producerId = '';
                    }
                    const micIndicator = memberElement.querySelector('.mic-indicator');
                    if (micIndicator) {
                        micIndicator.className = 'mic-indicator';
                        micIndicator.title = 'Микрофон выключен';
                    }
                }
                if (member) {
                    member.isOnline = false;
                    UIManager.addMessage('System', `Пользователь ${member.username} покинул комнату`);
                } else {
                    UIManager.addMessage('System', `Пользователь покинул комнату`);
                }
                this.playSound('user-leave');
            });

            socket.on('user-mic-state', (data) => {
                if (data.userId) {
                    MembersManager.updateMember(data.userId, { isMicActive: data.isActive });
                } else {
                    const members = MembersManager.getMembers();
                    const member = members.find((m) => m.clientId === data.clientID);
                    if (member) {
                        MembersManager.updateMember(member.userId, { isMicActive: data.isActive });
                    }
                }
            });

            socket.on('message-history', (data) => {
                if (data.roomId === this.currentRoom && data.messages) {
                    UIManager.clearMessages();
                    data.messages.forEach((msg) => {
                        UIManager.addMessage(
                            msg.username,
                            msg.text,
                            msg.timestamp,
                            msg.type || 'text',
                            msg.imageUrl || null,
                            msg.id,
                            msg.readBy || [],
                            msg.userId
                        );
                    });
                }
            });

            socket.on('new-message', (message) => {
                if (message.roomId === this.currentRoom) {
                    UIManager.addMessage(
                        message.username,
                        message.text,
                        null,
                        message.type || 'text',
                        message.imageUrl,
                        message.id,
                        message.readBy || [],
                        message.userId,
                        message.broadcast || false
                    );
                    if (message.text &&
                        (message.text.includes('=== ОТЛАДКА МАРШРУТОВ') ||
                            message.text.includes('=== ОТЛАДКА (СЕРВЕР)'))) {
                        console.log('🔍 [CLIENT] Серверная отладка обнаружена, отправляю клиентскую...');
                        setTimeout(() => {
                            this.handleDebugCommand();
                        }, 500);
                    }
                    if (message.type !== 'image' && message.username !== this.username) {
                        this.playSound('message');
                    }
                }
            });

            socket.on('error', (error) => {
                UIManager.showError('Ошибка соединения: ' + (error.message || 'неизвестная ошибка'));
            });

            socket.on('connect', () => {
                UIManager.updateStatus('Подключено', 'connected');
                if (this.currentRoom) {
                    socket.emit('join-room', { roomId: this.currentRoom });
                    socket.emit('subscribe-to-producers', { roomId: this.currentRoom });
                    socket.emit('get-current-producers', { roomId: this.currentRoom });
                }
                this.loadUnreadCounts();
                this.startPingInterval();
            });

            socket.on('disconnect', (reason) => {
                UIManager.updateStatus('Отключено', 'disconnected');
                this.stopPingInterval();
                if (reason !== 'io client disconnect' && this.currentRoom && !this.isReconnecting) {
                    setTimeout(() => {
                        if (this.currentRoom && !this.isReconnecting && !this._reconnectInProgress) {
                            this.reconnectToRoom(this.currentRoom);
                        }
                    }, 2000);
                }
            });
        } catch (error) {
            UIManager.showError('Ошибка подключения к серверу');
        }
    }

    startPingInterval() {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('ping');
            }
        }, 10000);
    }

    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    async loadUnreadCounts() {
        try {
            console.log('📬 [CLIENT] Loading unread counts...');
            const response = await fetch(`${this.API_SERVER_URL}/api/messages/unread`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const data = await response.json();
                console.log('📬 [CLIENT] Unread data received:', data);
                if (data.unread && typeof data.unread === 'object') {
                    UIManager.syncUnreadCounts(data.unread);
                }
            } else {
                console.error('📬 [CLIENT] Failed to load unread counts:', response.status);
            }
        } catch (error) {
            console.error('📬 [CLIENT] Error loading unread counts:', error);
        }
    }

    destroySocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.socketRoom = null;
        this.stopPingInterval();
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
            if (!this.currentRoom) {
                UIManager.showError('Микрофон доступен только в комнатах');
                return;
            }
            if (this.isMicActive) {
                const disabled = await MediaManager.disableMicrophone(this);
                if (!disabled) {
                    await MediaManager.stopMicrophone(this, false);
                }
                UIManager.updateMemberMicState(this.userId, false);
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
                    const enabled = await MediaManager.enableMicrophone(this);
                    if (!enabled) {
                        if (!this.sendTransport && this.mediaData) {
                            await MediaManager.connect(this, this.currentRoom, this.mediaData);
                        }
                        await MediaManager.startMicrophone(this);
                    }
                    UIManager.updateMemberMicState(this.userId, true);
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
                                userId: this.userId,
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
            if (this.isMicActive) {
                this.playSound('mic-on');
            } else {
                this.playSound('mic-off');
            }
        } catch (error) {
            UIManager.showError('Ошибка микрофона: ' + error.message);
            this.updateMicButtonState();
        }
    }

    sendMessage(text) {
        if (!text.trim()) return;
        if (!this.currentRoom) {
            UIManager.showError('Вы не в комнате');
            return;
        }
        const trimmedText = text.trim();
        if (trimmedText === '-отладка') {
            if (this.socket) {
                this.socket.emit('send-message', {
                    roomId: this.currentRoom,
                    text: trimmedText
                });
            }
            return;
        }
        if (trimmedText === '-инфо') {
            this.handleInfoCommand();
            return;
        }
        if (trimmedText === '-только для чтения') {
            this.handleReadOnlyCommand();
            return;
        }
        if (this.socket) {
            this.socket.emit('send-message', {
                roomId: this.currentRoom,
                text: trimmedText
            });
        } else {
            TextChatManager.sendMessage(this, text).catch((error) => {
                UIManager.showError('Ошибка отправки сообщения');
            });
        }
    }

    async handleDebugCommand() {
        if (!this.currentRoom) {
            UIManager.showError('Вы не в комнате');
            return;
        }

        // ========================================================================
        // 🔥 НОВАЯ СЕКЦИЯ: ИНФОРМАЦИЯ О ПРИВАТНОЙ КОМНАТЕ
        // ========================================================================
        const isPrivate = this.currentRoom.startsWith('user_') && this.currentRoom.includes('_user_');

        let debugMessage = '🔍 === ОТЛАДКА КЛИЕНТА ===\n';
        debugMessage += `👤 ClientID: ${this.clientID}\n`;
        debugMessage += `🏠 Комната: ${this.currentRoom}\n`;
        debugMessage += `🔗 Подключен: ${this.isConnected}\n`;
        debugMessage += `🔌 Socket: ${this.socket?.connected ? 'подключен' : 'отключен'}\n`;
        debugMessage += `📡 mediaData: ${this.mediaData ? 'получен' : 'нет'}\n`;

        // 🔥 ИНФОРМАЦИЯ О ПРИВАТНОЙ КОМНАТЕ
        debugMessage += `\n🏷️ ТИП КОМНАТЫ: ${isPrivate ? '✅ ПРИВАТНАЯ' : 'Обычная'}\n`;

        if (isPrivate) {
            // 🔥 ПОЛНЫЙ ID КОМНАТЫ
            debugMessage += `\n🆔 ПОЛНЫЙ ID КОМНАТЫ: \`${this.currentRoom}\`\n`;

            // 🔥 ПАРСИМ УЧАСТНИКОВ
            const parts = this.currentRoom.split('_user_');
            const user1Id = parts[0] || 'unknown';
	    const user2Id = parts[1] ? (parts[1].startsWith('user_') ? parts[1] : 'user_' + parts[1]) : 'unknown';
            debugMessage += `\n👥 УЧАСТНИКИ ПРИВАТНОЙ КОМНАТЫ (из ID):\n`;
            debugMessage += `   Участник 1 ID: \`${user1Id}\`\n`;
            debugMessage += `   Участник 2 ID: \`${user2Id}\`\n`;

            // 🔥 ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
            const isUser1 = this.userId === user1Id;
            const isUser2 = this.userId === user2Id;
            const otherUserId = isUser1 ? user2Id : (isUser2 ? user1Id : 'unknown');

            debugMessage += `\n🎯 ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ:\n`;
            debugMessage += `   Вы: \`${this.username}\` (${this.userId})\n`;
            debugMessage += `   Вы участник 1: ${isUser1 ? '✅ ДА' : '❌ НЕТ'}\n`;
            debugMessage += `   Вы участник 2: ${isUser2 ? '✅ ДА' : '❌ НЕТ'}\n`;
            debugMessage += `   Другой участник ID: \`${otherUserId}\`\n`;

            // 🔥 ЗАГРУЖАЕМ ИМЯ ДРУГОГО ПОЛЬЗОВАТЕЛЯ ИЗ КЭША
            const otherUserName = UIManager.usernameCache.get(otherUserId) || '❌ НЕ В КЭШЕ';
            debugMessage += `   Другой участник имя (кэш): \`${otherUserName}\`\n`;

            // 🔥 ИНФОРМАЦИЯ О СЕРВЕРЕ
            debugMessage += `\n🏠 ИНФОРМАЦИЯ О СЕРВЕРЕ:\n`;
            if (this.currentServer) {
                debugMessage += `   ID сервера: \`${this.currentServer.id}\`\n`;
                debugMessage += `   Название сервера (из БД): \`${this.currentServer.name || 'нет'}\`\n`;
                debugMessage += `   Тип сервера: \`${this.currentServer.type || 'unknown'}\`\n`;
                debugMessage += `   members: ${JSON.stringify(this.currentServer.members || [])}\n`;
                debugMessage += `   participantIds: ${JSON.stringify(this.currentServer.participantIds || [])}\n`;

                // 🔥 КАКОЕ НАЗВАНИЕ ВИДИТ ПОЛЬЗОВАТЕЛЬ (через RoomManager)
                const RoomManager = (await import('./RoomManager.js')).default;
                const expectedDisplayName = await RoomManager.getPrivateRoomDisplayName(
                    this.currentRoom,
                    this.userId,
                    this.currentServer
                );

                debugMessage += `\n👁️ ОТОБРАЖАЕМОЕ НАЗВАНИЕ:\n`;
                debugMessage += `   Ожидаемое (собеседник): \`${otherUserName}\`\n`;
                debugMessage += `   RoomManager.getDisplayName: \`${expectedDisplayName || 'null'}\`\n`;
                debugMessage += `   currentServer.name: \`${this.currentServer.name || 'null'}\`\n`;
                debugMessage += `   ⚠️ ПРОБЛЕМА: ${expectedDisplayName !== otherUserName ? 'getDisplayName не возвращает имя собеседника!' : '✅ OK'}\n`;
            } else {
                debugMessage += `   ❌ СЕРВЕР НЕ ЗАГРУЖЕН (currentServer = null)\n`;
            }

            // 🔥 ИНФОРМАЦИЯ О КОМНАТЕ
            debugMessage += `\n🏠 ИНФОРМАЦИЯ О КОМНАТЕ (клиент):\n`;
            const currentRoomData = this.rooms.find(room => room.id === this.currentRoom);
            if (currentRoomData) {
                debugMessage += `   ID комнаты: \`${currentRoomData.id}\`\n`;
                debugMessage += `   Название комнаты (клиент): \`${currentRoomData.name || 'нет'}\`\n`;
                debugMessage += `   serverId: \`${currentRoomData.serverId || 'нет'}\`\n`;
                debugMessage += `   members: ${JSON.stringify(currentRoomData.members || [])}\n`;
                debugMessage += `   participantIds: ${JSON.stringify(currentRoomData.participantIds || [])}\n`;
            } else {
                debugMessage += `   ❌ КОМНАТА НЕ НАЙДЕНА В client.rooms\n`;
            }
        }

        debugMessage += '\n🚚 ТРАНСПОРТЫ:\n';
        debugMessage += `   Send: ${this.sendTransport ? `${this.sendTransport.id} [${this.sendTransport.connectionState}]` : 'нет'}\n`;
        debugMessage += `   Recv: ${this.recvTransport ? `${this.recvTransport.id} [${this.recvTransport.connectionState}]` : 'нет'}\n`;

        debugMessage += '\n🎤 ПРОДЮСЕРЫ:\n';
        if (this.audioProducer) {
            debugMessage += `   • ${this.audioProducer.id} [audio] — ${this.audioProducer.track?.enabled ? 'активен' : 'выключен'}\n`;
        } else {
            debugMessage += `   (нет)\n`;
        }

        debugMessage += '\n🎧 КОНСЬЮМЕРЫ:\n';
        if (this.consumerState.size === 0) {
            debugMessage += `   (нет)\n`;
        } else {
            this.consumerState.forEach((state, pid) => {
                debugMessage += `   • ${pid} → ${state.status} ${state.lastError ? `[ошибка: ${state.lastError.message}]` : ''}\n`;
            });
        }

        debugMessage += '\n📋 МАППИНГИ:\n';
        const pum = window.producerUserMap?.size || 0;
        const pcm = window.producerClientMap?.size || 0;
        debugMessage += `   producerUserMap: ${pum} записей\n`;
        debugMessage += `   producerClientMap: ${pcm} записей\n`;

        debugMessage += '\n📬 НЕПРОЧИТАННЫЕ (клиент):\n';
        if (UIManager.unreadCounts && Object.keys(UIManager.unreadCounts).length > 0) {
            let totalUnread = 0;
            let totalPersonal = 0;
            for (const [serverId, data] of Object.entries(UIManager.unreadCounts)) {
                totalUnread += data.total || 0;
                totalPersonal += data.personalTotal || 0;
                debugMessage += `   Сервер ${serverId}: ${data.total} сообщений${data.hasMentionTotal ? ' (есть упоминание)' : ''}`;
                if (data.personalTotal > 0) {
                    debugMessage += ` (${data.personalTotal} персональных)`;
                }
                debugMessage += '\n';
            }
            debugMessage += `   Итого: ${totalUnread} непрочитанных (${totalPersonal} персональных)\n`;
        } else {
            debugMessage += `   (нет непрочитанных)\n`;
        }

        debugMessage += '\n🎨 === ОТРИСОВКА БЕЙДЖЕЙ НЕПРОЧИТАННЫХ ===\n';
        debugMessage += this.getUnreadBadgeDebugInfo();

        debugMessage += '\n🔍 === ЗАПРОС К СЕРВЕРУ ===\n';
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/messages/unread`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const serverData = await response.json();
                debugMessage += `   Статус: OK ✅\n`;
                debugMessage += `   Данные с сервера:\n`;
                if (serverData.unread && Object.keys(serverData.unread).length > 0) {
                    for (const [serverId, rooms] of Object.entries(serverData.unread)) {
                        let serverTotal = 0;
                        debugMessage += `   📁 Сервер ${serverId}:\n`;
                        for (const [roomId, roomData] of Object.entries(rooms)) {
                            debugMessage += `      • ${roomId}: ${roomData.count} сообщений`;
                            if (roomData.hasMention) debugMessage += ' (🔔 упоминание)';
                            if (roomData.personalCount > 0) debugMessage += ` (${roomData.personalCount} персональных)`;
                            debugMessage += '\n';
                            serverTotal += roomData.count || 0;
                        }
                        debugMessage += `      └─ Итого: ${serverTotal}\n`;
                    }
                } else {
                    debugMessage += `   (нет непрочитанных на сервере)\n`;
                }
            } else {
                debugMessage += `   Статус: ERROR ${response.status} ❌\n`;
            }
        } catch (error) {
            debugMessage += `   Ошибка запроса: ${error.message} ❌\n`;
        }

        debugMessage += '\n=================================';

        UIManager.addMessage(
            '🔍 System Debug',
            debugMessage,
            new Date().toISOString(),
            'system',
            null,
            `debug_local_${Date.now()}`,
            [],
            'system',
            true
        );

        console.log('🔍 [CLIENT DEBUG]', debugMessage);
    }

    getUnreadBadgeDebugInfo() {
        let info = '';
        const serversList = document.querySelector('.servers-list');
        if (serversList) {
            const serverBadges = serversList.querySelectorAll('.unread-badge');
            info += `   📁 Servers List: ${serverBadges.length} бейджей\n`;
            serverBadges.forEach((badge, i) => {
                const serverItem = badge.closest('.server-item');
                const serverId = serverItem?.dataset?.server || 'unknown';
                info += `      • Сервер ${serverId}: "${badge.textContent}"\n`;
            });
        } else {
            info += `   📁 Servers List: не найден ❌\n`;
        }
        const roomsList = document.querySelector('.rooms-list');
        if (roomsList) {
            const roomBadges = roomsList.querySelectorAll('.room-unread-badge');
            info += `   🏠 Rooms List: ${roomBadges.length} бейджей\n`;
            roomBadges.forEach((badge, i) => {
                const roomItem = badge.closest('.room-item');
                const roomId = roomItem?.dataset?.room || 'unknown';
                info += `      • Комната ${roomId}: "${badge.textContent}"\n`;
            });
        } else {
            info += `   🏠 Rooms List: не найден ❌\n`;
        }
        const currentRoomTitle = document.querySelector('.current-room-title');
        if (currentRoomTitle) {
            const titleBadges = currentRoomTitle.querySelectorAll('.room-unread-badge, .title-unread-badge');
            info += `   📌 Current Room Title: ${titleBadges.length} бейджей\n`;
            titleBadges.forEach((badge, i) => {
                info += `      • Заголовок: "${badge.textContent}"\n`;
            });
        } else {
            info += `   📌 Current Room Title: не найден ❌\n`;
        }
        const serversToggle = document.querySelector('#serversToggle');
        if (serversToggle) {
            const toggleBadge = serversToggle.querySelector('.unread-badge');
            if (toggleBadge) {
                info += `   🔘 Servers Toggle: "${toggleBadge.textContent}"\n`;
            } else {
                info += `   🔘 Servers Toggle: нет бейджа\n`;
            }
        }
        return info;
    }

    async handleInfoCommand() {
        if (!this.currentRoom) {
            UIManager.showError('Вы не в комнате');
            return;
        }
        let infoMessage = 'ℹ️ === ИНФОРМАЦИЯ О КОМНАТЕ ===\n';
        infoMessage += `🆔 Room ID: ${this.currentRoom}\n`;
        infoMessage += `🔗 Подключен: ${this.isConnected}\n`;
        infoMessage += `🎤 Микрофон: ${this.isMicActive ? '✅ ВКЛ' : '❌ ВЫКЛ'}\n`;
        infoMessage += `📡 Продюсеры: ${this.audioProducer ? 1 : 0}\n`;
        infoMessage += `🎧 Консьюмеры: ${this.consumerState.size}\n`;
        const members = MembersManager.getMembers();
        const onlineMembers = members.filter(m => m.isOnline);
        infoMessage += `\n👥 Участники: ${onlineMembers.length} онлайн / ${members.length - onlineMembers.length} оффлайн\n`;
        infoMessage += '\n=================================';
        UIManager.addMessage(
            'System (Info)',
            infoMessage,
            new Date().toISOString(),
            'system',
            null,
            `info_local_${Date.now()}`,
            [],
            'system'
        );
    }

    handleReadOnlyCommand() {
        if (!this.currentRoom) {
            UIManager.showError('Вы не в комнате');
            return;
        }
        if (this.socket) {
            this.socket.emit('send-message', {
                roomId: this.currentRoom,
                text: '-только для чтения'
            });
        }
    }

    async startConsuming() {
        if (!this.isConnected || !this.currentRoom) {
            return;
        }
        try {
            const timestamp = Date.now();
            const response = await fetch(
                `${this.API_SERVER_URL}/api/media/rooms/${this.currentRoom}/producers?t=${timestamp}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        Pragma: 'no-cache'
                    }
                }
            );
            if (!response.ok) {
                return;
            }
            const data = await response.json();
            const producers = data.producers || [];
            for (const producer of producers) {
                if (producer.clientID !== this.clientID) {
                    await this.ensureConsumer(producer.id, producer);
                } else {
                    this.consumerState.set(producer.id, {
                        status: 'own-producer',
                        consumer: null,
                        lastError: null
                    });
                }
            }
        } catch (error) {
            // ignore
        }
    }

    async disconnectFromRoom() {
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
            this.updateMicButtonState();
        }
    }

    async reconnectToRoom(roomId, maxRetries = 5, retryDelay = 2000, clearUnread = false) {
        if (this.currentRoom === roomId && this.isConnected && this.socket?.connected) {
            await this.startConsuming();
            return true;
        }
        if (!this._reconnectMessageShown) {
            UIManager.addMessage('System', 'Переподключение к комнате...');
            this._reconnectMessageShown = true;
        }
        this.wasMicActiveBeforeReconnect = this.isMicActive;
        if (this.isMicActive && this.mediaData) {
            await MediaManager.stopMicrophone(this);
        }
        await this.leaveRoom();
        this.isReconnecting = true;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 500 : retryDelay));
                const result = await this.joinRoom(roomId, clearUnread);
                this.isReconnecting = false;
                if (this.wasMicActiveBeforeReconnect && this.mediaData) {
                    setTimeout(async () => {
                        try {
                            await MediaManager.startMicrophone(this);
                            this.wasMicActiveBeforeReconnect = false;
                            setTimeout(() => this.forceRefreshProducers(), 2000);
                        } catch (error) {
                            // ignore
                        }
                    }, 3000);
                }
                return result;
            } catch (error) {
                const isTransientError =
                    error.message.includes('404') ||
                    error.message.includes('502') ||
                    error.message.includes('503') ||
                    error.message.includes('504') ||
                    error.message.includes('Failed to fetch');
                if (!isTransientError || attempt === maxRetries) {
                    this.isReconnecting = false;
                    if (!this._isAutoConnect) {
                        UIManager.addMessage('System', '❌ Не удалось подключиться к комнате');
                        UIManager.showError('Ошибка переподключения: ' + error.message);
                    }
                    this.currentRoom = null;
                    localStorage.removeItem('lastRoomId');
                    throw error;
                }
            }
        }
    }

    async leaveRoom() {
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
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            document.querySelectorAll('.member-volume-slider').forEach((slider) => {
                slider.style.display = 'none';
                slider.dataset.producerId = '';
            });
            MembersManager.clearMembers();
            this.currentRoom = null;
            this.roomType = null;
            UIManager.updateRoomUI(this);
            UIManager.addMessage('System', `✅ Вы покинули комнату`);
            return true;
        } catch (error) {
            UIManager.showError('Ошибка при покидании комнаты: ' + error.message);
            return false;
        }
    }

    autoConnect() {
        this.elements.sidebar.classList.add('open');
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

    async checkRoomState() {
        if (!this.currentRoom) {
            return;
        }
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/debug/room/${this.currentRoom}`, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const roomState = await response.json();
                return roomState;
            }
        } catch (error) {
            // ignore
        }
    }

    async forceRefreshProducers() {
        try {
            const timestamp = Date.now();
            const response = await fetch(
                `${this.API_SERVER_URL}/api/media/rooms/${this.currentRoom}/producers/force?t=${timestamp}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        Pragma: 'no-cache'
                    }
                }
            );
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            const producers = data.producers || [];
            for (const producer of producers) {
                if (producer.clientID !== this.clientID && !this.existingProducers.has(producer.id)) {
                    try {
                        await MediaManager.createConsumer(this, producer.id);
                        this.existingProducers.add(producer.id);
                    } catch (error) {
                        if (error.message.includes('consume own')) {
                            this.existingProducers.add(producer.id);
                        }
                    }
                }
            }
        } catch (error) {
            // ignore
        }
    }

    _getClientRouteDebug() {
        let out = '🔍 === МАРШРУТЫ КЛИЕНТА ===\n';
        out += `👤 clientID: ${this.clientID}\n`;
        out += `🏠 Комната: ${this.currentRoom || 'нет'}\n`;
        out += `🔗 isConnected: ${this.isConnected}\n`;
        out += `🔌 Socket: ${this.socket?.connected ? 'подключен' : 'отключен'}\n`;
        out += `📡 mediaData: ${this.mediaData ? 'получен' : 'нет'}\n`;
        out += '\n🚚 ТРАНСПОРТЫ:\n';
        out += `   Send: ${this.sendTransport ? `${this.sendTransport.id} [${this.sendTransport.connectionState}]` : 'нет'}\n`;
        out += `   Recv: ${this.recvTransport ? `${this.recvTransport.id} [${this.recvTransport.connectionState}]` : 'нет'}\n`;
        out += '\n🎤 ПРОДЮСЕРЫ:\n';
        if (this.audioProducer) {
            out += `   • ${this.audioProducer.id} [audio] — ${this.audioProducer.track?.enabled ? 'активен' : 'выключен'}\n`;
        } else {
            out += `   (нет)\n`;
        }
        out += '\n🎧 КОНСЬЮМЕРЫ:\n';
        if (this.consumerState.size === 0) {
            out += `   (нет)\n`;
        } else {
            this.consumerState.forEach((state, pid) => {
                out += `   • ${pid} → ${state.status} ${state.lastError ? `[ошибка: ${state.lastError.message}]` : ''}\n`;
            });
        }
        out += '\n📋 МАППИНГИ:\n';
        const pum = window.producerUserMap?.size || 0;
        const pcm = window.producerClientMap?.size || 0;
        out += `   producerUserMap: ${pum} записей\n`;
        out += `   producerClientMap: ${pcm} записей\n`;
        if (window.producerUserMap?.size) {
            window.producerUserMap.forEach((uid, pid) => {
                out += `     ${pid} → ${uid}\n`;
            });
        }
        if (window.producerClientMap?.size) {
            window.producerClientMap.forEach((cid, pid) => {
                out += `     ${pid} → ${cid}\n`;
            });
        }
        out += '\n📬 НЕПРОЧИТАННЫЕ (клиент):\n';
        if (UIManager.unreadCounts && Object.keys(UIManager.unreadCounts).length > 0) {
            let totalUnread = 0;
            let totalPersonal = 0;
            for (const [serverId, data] of Object.entries(UIManager.unreadCounts)) {
                totalUnread += data.total || 0;
                totalPersonal += data.personalTotal || 0;
                out += `   Сервер ${serverId}: ${data.total} сообщений${data.hasMentionTotal ? ' (есть упоминание)' : ''}`;
                if (data.personalTotal > 0) {
                    out += ` (${data.personalTotal} персональных)`;
                }
                out += '\n';
            }
            out += `   Итого: ${totalUnread} непрочитанных (${totalPersonal} персональных)\n`;
        } else {
            out += `   (нет непрочитанных)\n`;
        }
        out += '\n🌐 СОКЕТ:\n';
        out += `   ID: ${this.socket?.id || 'нет'}\n`;
        out += `   Room: ${this.socketRoom || 'нет'}\n`;
        out += `   Reconnecting: ${this.isReconnecting}\n`;
        out += '\n=================================';
        return out;
    }
}

export default VoiceChatClient;
