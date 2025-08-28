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
        this.serversPanel = document.querySelector('.servers-panel');
        this.roomsPanel = document.querySelector('.rooms-panel');
        this.sidebar = document.querySelector('.sidebar');
        this.membersPanel = document.querySelector('.members-panel');
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
            this.showPanel('servers');
        });

        this.roomsToggleBtn.addEventListener('click', () => {
            this.showPanel('rooms');
        });
    }

    showPanel(panelName) {
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
            
            if (!data.success) {
                throw new Error(data.error || 'Не удалось войти в комнату');
            }
            
            this.clientID = data.clientId;
            this.mediaData = data.mediaData;
            await MediaManager.connect(this, roomId, data.mediaData);
            
            setTimeout(() => {
                this.startConsuming();
            }, 1000);
            
            this.showMessage('System', 'Вы вошли в комнату');
            UIManager.onRoomJoined(this, data.roomName);
            
        } catch (e) {
            console.error('Ошибка входа в комнату:', e);
            UIManager.updateStatus('Ошибка: ' + e.message, 'disconnected');
        }
    }

    async toggleMicrophone() {
        if (this.isMicActive) {
            await MediaManager.stopMicrophone(this);
        } else {
            await MediaManager.startMicrophone(this);
        }
        UIManager.updateMicButton(this.isMicActive ? 'active' : 'connected');
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
        }, 15000);
    }

    async startConsuming() {
        try {
            if (!this.mediaData || !this.currentRoom || !this.isConnected) return;

            const response = await fetch(`${this.API_SERVER_URL}/api/room/${this.currentRoom}/producers`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            const activeProducerIds = new Set(data.producers.map(p => p.id));
            
            for (const producerId of this.existingProducers) {
                if (!activeProducerIds.has(producerId)) {
                    const consumer = this.consumers.get(producerId);
                    if (consumer) {
                        consumer.close();
                        this.consumers.delete(producerId);
                    }
                    this.existingProducers.delete(producerId);
                }
            }
            
            for (const producer of data.producers) {
                if (producer.clientID !== this.clientID && !this.existingProducers.has(producer.id)) {
                    await MediaManager.createConsumer(this, producer.id);
                    this.existingProducers.add(producer.id);
                }
            }
        } catch (error) {
            console.error('Ошибка потребления:', error);
        }
    }

    async reconnectToRoom(roomId) {
        this.disconnectFromMedia();
        this.destroySocket();
        this.currentRoom = roomId;
        await this.joinRoom(roomId);
    }

    disconnectFromMedia() {
        MediaManager.disconnect(this);
    }

    destroySocket() {
        // Реализация уничтожения сокета
        if (this.socket) {
            console.log('Закрытие сокета');
            this.socket.disconnect();
            this.socket = null;
        }
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
}

export default VoiceChatClient;
