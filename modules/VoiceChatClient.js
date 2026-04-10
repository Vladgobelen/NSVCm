import MediaManager from './MediaManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import Utils from './Utils.js';
import TextChatManager from './TextChatManager.js';
import InviteManager from './InviteManager.js';
import MembersManager from './MembersManager.js';
import AuthManager from './AuthManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';
import ModalManager from './ModalManager.js';
import SecondaryChatManager from './SecondaryChatManager.js';
import DiagnosticPanel from './DiagnosticPanel.js';
import MessageRenderer from './MessageRenderer.js';

const PING_INTERVAL = 10000;
const JOIN_TIMEOUT = 9000;
const CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
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
        window.voiceClient = this;
        this.consumerState = new Map();
        this.stream = null;
        this.isMicActive = false;
        this.isMicPaused = false;
        this.currentRoom = null;
        this.currentServerId = null;
        this.currentServer = null;
        this.servers = [];
        this.rooms = [];
        this.pingInterval = null;
        this.isConnected = false;
        this.mediaData = null;
        this.userId = null;
        this.token = null;
        this.username = null;
        this.tokenVersion = 1;
        this.activePanel = 'servers';
        this.inviteServerId = null;
        this.isCreatingRoom = false;
        this.socket = null;
        this.wasMicActiveBeforeReconnect = false;
        this.isReconnecting = false;
        this.pendingInviteCode = null;
        this.elements = {};
        this.socketRoom = null;
        this.connectionState = CONNECTION_STATE.DISCONNECTED;
        this.requestIdCounter = 0;
        this.pendingRequests = new Map();
        this.pendingProducersRef = [];
        this.consumedProducerIdsRef = new Set();
        this.joinAbortController = null;
        this._micToggleDebounce = null;
        this._mediaFetchController = null;
        this._isProcessingConsumers = false;
        this._isMediaReconnecting = false;
        
        // 🔥 История чата
        this.isHistoryLoading = false;
        this.hasMoreHistory = true;
        this.oldestMessageId = null;
        this.historyObserver = null;
        
        this.secondaryChat = {
            enabled: false,
            roomId: null,
            isLoading: false,
            hasMore: true,
            oldestMessageId: null
        };
        this._authFetchController = null;
        this.diagnosticActive = false;
        this.init();
    }

    _abortMediaRequests() {
        if (this.joinAbortController) {
            this.joinAbortController.abort();
            this.joinAbortController = null;
        }
        if (this._mediaFetchController) this._mediaFetchController.abort();
        this._mediaFetchController = new AbortController();
        return this._mediaFetchController;
    }

    _abortAuthRequests() {
        if (this._authFetchController) this._authFetchController.abort();
        this._authFetchController = new AbortController();
        return this._authFetchController;
    }

    async _fetchWithTimeout(url, options = {}, timeoutMs = JOIN_TIMEOUT, abortable = true) {
        const controller = abortable ? this._abortMediaRequests() : this._abortAuthRequests();
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.token}`,
                    ...(options.headers || {})
                },
                signal: controller.signal || timeoutController.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`HTTP ${response.status}: ${text}`);
            }
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                if (abortable) throw new Error('Request cancelled');
                throw error;
            }
            throw error;
        }
    }

    logToRoomChat(message, type = 'system') {
        if (!this.currentRoom || !this.socket) return false;
        const requestId = `req_${Date.now()}_${this.requestIdCounter++}`;
        this.socket.emit('send-message', {
            roomId: this.currentRoom,
            text: message,
            type: 'system',
            isSystem: true,
            requestId,
            timestamp: new Date().toISOString()
        });
        this.pendingRequests.set(requestId, { message, type, timestamp: Date.now(), roomId: this.currentRoom });
        setTimeout(() => this.pendingRequests.delete(requestId), 5000);
        return requestId;
    }

    setConnectionState(state, roomId = null) {
        const previousState = this.connectionState;
        this.connectionState = state;
        if (previousState !== state) {
            const stateMessages = {
                [CONNECTION_STATE.DISCONNECTED]: '🔴 Отключен',
                [CONNECTION_STATE.ERROR]: '❌ Ошибка подключения'
            };
            const message = stateMessages[state];
            if (message && (roomId || this.currentRoom)) {
                this.logToRoomChat(message, 'connection');
            }
            UIManager.updateStatus(
                message || '',
                state === CONNECTION_STATE.CONNECTED ? 'connected' : state === CONNECTION_STATE.ERROR ? 'error' : 'connecting'
            );
        }
    }

    playSound(soundName) {
        if (typeof Audio === 'undefined') return;
        const audio = new Audio(`/sounds/${soundName}.mp3`);
        audio.volume = 1.0;
        audio.play().catch(() => {});
    }

    async init() {
        this.initElements();
        this.initEventListeners();
        this.setupElectronBridge();
        UIManager.setClient(this);
        InviteManager.init(this);
        await this.initAutoConnect();
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
        this.elements.splitToggleBtn = document.querySelector('.split-toggle-btn');
        
        if (!this.elements.splitToggleBtn) {
            const headerControls = document.querySelector('.header-controls');
            const micBtn = headerControls?.querySelector('.mic-toggle-btn');
            if (headerControls) {
                const splitBtn = document.createElement('button');
                splitBtn.className = 'split-toggle-btn';
                splitBtn.innerHTML = '🔲';
                splitBtn.title = 'Разделить чат';
                splitBtn.id = 'splitToggleBtn';
                if (micBtn) headerControls.insertBefore(splitBtn, micBtn);
                else headerControls.appendChild(splitBtn);
                this.elements.splitToggleBtn = splitBtn;
            }
        }
        
        // 🔥 Инициализация Sentinel
        if (this.elements.messagesContainer) {
            let sentinel = this.elements.messagesContainer.querySelector('.history-sentinel');
            if (!sentinel) {
                console.log('[History] 🛠️ Создание нового DOM-элемента history-sentinel');
                sentinel = document.createElement('div');
                sentinel.className = 'history-sentinel';
                sentinel.style.cssText = 'height: 1px; width: 1px; margin: 0; padding: 0; overflow: hidden; visibility: hidden;';
                this.elements.messagesContainer.prepend(sentinel);
            }
            this.elements.historySentinel = sentinel;
        }

        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.addEventListener('click', () => ServerManager.clearSearchAndShowAllServers(this));
        }
        
        if (this.elements.messagesContainer) {
            MessageRenderer.initReactionHover(this.elements.messagesContainer);
        }
    }

    resetHistoryState() {
        console.log('[History] 🔄 resetHistoryState вызван');
        this.removeHistorySentinel();
        this.hasMoreHistory = true;
        this.isHistoryLoading = false;
        this.oldestMessageId = null;
        if (this.elements.messagesContainer) {
            const sentinel = document.createElement('div');
            sentinel.className = 'history-sentinel';
            sentinel.style.cssText = 'height: 1px; width: 1px; margin: 0; padding: 0; overflow: hidden; visibility: hidden;';
            this.elements.messagesContainer.prepend(sentinel);
            this.elements.historySentinel = sentinel;
            console.log('[History] 🛠️ Sentinel пересоздан в resetHistoryState');
        }
    }

    initEventListeners() {
        const userGestureHandler = async () => {
            await VolumeBoostManager.resume();
            if (/Android/i.test(navigator.userAgent)) {
                await VolumeBoostManager.unlockAndroidAudio();
            }
            document.removeEventListener('click', userGestureHandler, { once: true });
            document.removeEventListener('touchstart', userGestureHandler, { once: true });
        };
        document.addEventListener('click', userGestureHandler, { once: true });
        document.addEventListener('touchstart', userGestureHandler, { once: true });
        
        const micHandler = async () => await this.toggleMicrophone();
        if (this.elements.micButton) {
            this.elements.micButton.addEventListener('click', micHandler);
            this.elements.micButton.title = 'Микрофон (основной)';
        }
        if (this.elements.micToggleBtn) {
            this.elements.micToggleBtn.addEventListener('click', micHandler);
            this.elements.micToggleBtn.title = 'Микрофон (быстрый)';
        }
        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const text = this.elements.messageInput.value.trim();
                    if (text) {
                        this.sendMessage(text);
                        this.elements.messageInput.value = '';
                        this.elements.messageInput.style.height = '40px';
                    }
                }
            });
            this.elements.messageInput.addEventListener('input', () => {
                const el = this.elements.messageInput;
                el.style.height = '40px';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            });
        }
        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', () => {
                this.sendMessage(this.elements.messageInput.value);
                this.elements.messageInput.value = '';
            });
        }
        if (this.elements.toggleSidebarBtn) {
            this.elements.toggleSidebarBtn.addEventListener('click', () => this.elements.sidebar.classList.toggle('open'));
        }
        if (this.elements.toggleMembersBtn) {
            this.elements.toggleMembersBtn.addEventListener('click', () => this.elements.membersPanel.classList.toggle('open'));
        }
        if (this.elements.closePanelBtn) {
            this.elements.closePanelBtn.addEventListener('click', () => this.elements.membersPanel.classList.remove('open'));
        }
        if (this.elements.closeSidebarBtn) {
            this.elements.closeSidebarBtn.addEventListener('click', () => this.elements.sidebar.classList.remove('open'));
        }
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.addEventListener('click', () => ModalManager.openSettingsModal(this));
        }
        if (this.elements.createServerBtn) {
            this.elements.createServerBtn.addEventListener('click', () => ServerManager.createServer(this));
        }
        if (this.elements.createRoomBtn) {
            this.elements.createRoomBtn.addEventListener('click', () => {
                if (!this.currentServerId) return UIManager.showError('Сначала выберите дерево');
                ModalManager.openCreateRoomModal(this, (name) => RoomManager.createRoom(this, this.currentServerId, name));
            });
        }
        if (this.elements.serversToggleBtn) {
            this.elements.serversToggleBtn.addEventListener('click', () => {
                ServerManager.clearSearchAndShowAllServers(this);
                this.showPanel('servers');
            });
        }
        if (this.elements.roomsToggleBtn) {
            this.elements.roomsToggleBtn.addEventListener('click', () => this.showPanel('rooms'));
        }
        if (this.elements.serverSearchInput) {
            this.elements.serverSearchInput.addEventListener('input', (e) => this.searchServers(e.target.value));
        }
        if (this.elements.splitToggleBtn) {
            this.elements.splitToggleBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const direction = SecondaryChatManager.getDirection();
                await SecondaryChatManager.toggle(this, direction);
            });
        }
        
        const headerControls = document.querySelector('.header-controls');
        if (headerControls) {
            let diagBtn = document.querySelector('.diag-toggle-btn');
            if (!diagBtn) {
                diagBtn = document.createElement('button');
                diagBtn.className = 'diag-toggle-btn';
                diagBtn.innerHTML = '📊';
                diagBtn.title = 'Диагностика комнаты';
                diagBtn.style.cssText = 'background:none; border:none; font-size:18px; cursor:pointer; margin-right:8px;';
                const micBtn = headerControls.querySelector('.mic-toggle-btn');
                if (micBtn) headerControls.insertBefore(diagBtn, micBtn);
                else headerControls.appendChild(diagBtn);
            }
            diagBtn.addEventListener('click', () => {
                if (this.diagnosticActive) this.stopDiagnostic();
                else this.startDiagnostic();
            });
        }
        
        const mainContent = document.querySelector('.main-content');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/jpeg,image/png,image/webp';
        fileInput.style.display = 'none';
        fileInput.id = 'image-upload-input';
        document.body.appendChild(fileInput);
        
        const attachBtn = document.querySelector('.attach-btn');
        if (mainContent) {
            mainContent.addEventListener('click', (e) => {
                if (!e.target.closest('.message-input, .send-btn, .mic-toggle-btn, .settings-btn, .toggle-members-btn, .current-room-title, .toggle-sidebar-btn, .attach-btn, .split-toggle-btn')) {
                    this.elements.sidebar.classList.remove('open');
                    this.elements.membersPanel.classList.remove('open');
                }
            });
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
                if (!this.currentRoom) return UIManager.showError('Сначала займите гнездо');
                const file = e.dataTransfer.files[0];
                if (!file) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                    return UIManager.showError('Поддерживаются только изображения: JPEG, PNG, WebP');
                }
                if (file.size > 5 * 1024 * 1024) return UIManager.showError('Файл слишком большой (макс. 5 МБ)');
                try {
                    const urls = await TextChatManager.uploadImage(this, this.currentRoom, file);
                    await TextChatManager.sendMessage(this, urls, 'image');
                } catch (error) {
                    UIManager.showError('Не удалось отправить изображение: ' + error.message);
                }
            });
        }
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!this.currentRoom) return UIManager.showError('Сначала займите гнездо');
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                return UIManager.showError('Поддерживаются только изображения: JPEG, PNG, WebP');
            }
            if (file.size > 5 * 1024 * 1024) return UIManager.showError('Файл слишком большой (макс. 5 МБ)');
            try {
                const urls = await TextChatManager.uploadImage(this, this.currentRoom, file);
                await TextChatManager.sendMessage(this, urls, 'image');
            } catch (error) {
                UIManager.showError('Не удалось отправить изображение: ' + error.message);
            } finally {
                fileInput.value = '';
            }
        });
        
        if (attachBtn) attachBtn.addEventListener('click', () => fileInput.click());
        
        document.addEventListener('paste', async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            let imageFile = null;
            for (const item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) { imageFile = file; break; }
                }
            }
            if (!imageFile) return;
            e.preventDefault();
            if (!this.currentRoom) return UIManager.showError('Сначала займите гнездо');
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type)) {
                return UIManager.showError('Поддерживаются только изображения: JPEG, PNG, WebP');
            }
            if (imageFile.size > 5 * 1024 * 1024) return UIManager.showError('Файл слишком большой (макс. 5 МБ)');
            try {
                const urls = await TextChatManager.uploadImage(this, this.currentRoom, imageFile);
                await TextChatManager.sendMessage(this, urls, 'image');
            } catch (error) {
                UIManager.showError('Не удалось отправить изображение: ' + error.message);
            }
        });
        
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (isAndroid && !document.getElementById('android-audio-unlock')) {
            const androidUnlockBtn = document.createElement('button');
            androidUnlockBtn.id = 'android-audio-unlock';
            androidUnlockBtn.textContent = '🔊 Включить звук';
            androidUnlockBtn.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;padding:12px 24px;background:#4CAF50;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;';
            androidUnlockBtn.addEventListener('click', async () => {
                const success = await VolumeBoostManager.unlockAndroidAudio();
                if (success) {
                    androidUnlockBtn.style.display = 'none';
                    UIManager.addMessage('System', '✅ Звук разблокирован');
                }
            });
            document.body.appendChild(androidUnlockBtn);
            const originalJoinRoom = this.joinRoom.bind(this);
            this.joinRoom = async (...args) => {
                const result = await originalJoinRoom(...args);
                if (result && isAndroid) {
                    const ctx = VolumeBoostManager.audioCtx;
                    if (!ctx || ctx.state === 'suspended') androidUnlockBtn.style.display = 'block';
                }
                return result;
            };
        }
    }

    initHistoryObserver() {
        console.log('[History] 🕵️‍♂️ initHistoryObserver вызван');
        if (this.historyObserver) this.historyObserver.disconnect();
        
        const sentinel = this.elements.historySentinel || this.elements.messagesContainer?.querySelector('.history-sentinel');
        if (!sentinel || !this.elements.messagesContainer) {
            console.error('[History] ❌ Sentinel или messagesContainer не найдены. Observer не запущен.');
            return;
        }
        console.log('[History] ✅ Sentinel найден в DOM');
        
        this.historyObserver = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                console.log(`[History] 👁️ Intersection: isIntersecting=${entry.isIntersecting}, hasMore=${this.hasMoreHistory}, isLoading=${this.isHistoryLoading}`);
                if (entry.isIntersecting && this.hasMoreHistory && !this.isHistoryLoading) {
                    console.log('[History] 🔥 Sentinel в зоне видимости -> вызов loadHistory()');
                    this.loadHistory();
                }
            },
            { root: this.elements.messagesContainer, rootMargin: '150px 0px 0px 0px', threshold: 0.01 }
        );
        this.historyObserver.observe(sentinel);
        console.log('[History] 👁️ Observer успешно запущен');
    }

    async loadHistory() {
        console.log(`[History] 📦 loadHistory: loading=${this.isHistoryLoading}, hasMore=${this.hasMoreHistory}, oldestId=${this.oldestMessageId}, room=${this.currentRoom}`);
        if (this.isHistoryLoading || !this.hasMoreHistory || !this.currentRoom) {
            console.log('[History] 🛑 Загрузка отменена (условия не выполнены)');
            return;
        }
        
        this.isHistoryLoading = true;
        this.updateHistorySentinel(true);
        try {
            console.log(`[History] 🌐 Запрос к серверу: loadMoreMessages(room=${this.currentRoom}, before=${this.oldestMessageId})`);
            const result = await TextChatManager.loadMoreMessages(this, this.currentRoom, this.oldestMessageId);
            
            if (result && result.messages && result.messages.length > 0) {
                this.oldestMessageId = result.messages[0].id;
                this.hasMoreHistory = result.hasMore;
                console.log(`[History] ✅ Получено ${result.messages.length} сообщений. hasMore=${this.hasMoreHistory}, новый oldestId=${this.oldestMessageId}`);
            } else {
                console.log('[History] ⚠️ Сервер вернул 0 сообщений или пустой результат.');
                this.hasMoreHistory = false;
            }
            
            if (!this.hasMoreHistory) {
                console.log('[History] 🚫 История исчерпана, удаляем sentinel.');
                this.removeHistorySentinel();
            }
        } catch (error) {
            console.error('[History] ❌ Ошибка загрузки истории:', error);
            this.hasMoreHistory = true; // Разрешаем повторную попытку при ошибке
        } finally {
            this.isHistoryLoading = false;
            this.updateHistorySentinel(false);
            console.log('[History] 🏁 loadHistory завершен, isHistoryLoading=false');
        }
    }

    updateHistorySentinel(isLoading) {
        const sentinel = this.elements.historySentinel || this.elements.messagesContainer?.querySelector('.history-sentinel');
        if (sentinel) {
            sentinel.innerHTML = isLoading ? '⏳ Загрузка...' : '';
        }
    }

    removeHistorySentinel() {
        console.log('[History] 🗑️ removeHistorySentinel вызван');
        if (this.historyObserver) {
            this.historyObserver.disconnect();
            this.historyObserver = null;
        }
        const sentinel = this.elements.historySentinel || this.elements.messagesContainer?.querySelector('.history-sentinel');
        if (sentinel) sentinel.remove();
    }

    showPanel(panelName) {
        const { serversPanel, roomsPanel, serversToggleBtn, roomsToggleBtn } = this.elements;
        if (!serversPanel || !roomsPanel || !serversToggleBtn || !roomsToggleBtn) return;
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
            if (storedInvite && storedInvite !== inviteCode) localStorage.removeItem('pending_invite');
            this.pendingInviteCode = inviteCode;
            InviteManager.setPendingInvite(inviteCode);
        }
    }

    async ensureConsumer(producerId, producerData = {}) {
        if (this.consumedProducerIdsRef.has(producerId)) return true;
        if (producerData.clientID === this.clientID) {
            this.consumedProducerIdsRef.add(producerId);
            return false;
        }
        if (!this.recvTransport || this.recvTransport.closed || this.recvTransport.connectionState === 'failed') {
            this.pendingProducersRef.push(producerData);
            return false;
        }
        try {
            this.socket.emit(
                'consume',
                {
                    producerId,
                    rtpCapabilities: this.device.rtpCapabilities,
                    transportId: this.recvTransport.id,
                    clientId: this.clientID
                },
                async (response) => {
                    if (!response?.success || !response.consumerParameters) return;
                    try {
                        const { consumer, audioElement } = await MediaManager.createConsumer(this, response.consumerParameters);
                        this.consumerState.set(response.consumerParameters.producerId, {
                            status: 'active',
                            consumer,
                            audioElement,
                            lastError: null
                        });
                        this.consumedProducerIdsRef.add(response.consumerParameters.producerId);
                        const members = MembersManager.getMembers();
                        const member = members.find(
                            (m) => m.clientId === response.consumerParameters.peerId || m.userId === response.consumerParameters.peerId
                        );
                        const userId = member?.userId || response.consumerParameters.peerId;
                        if (userId) {
                            if (!window.producerUserMap) window.producerUserMap = new Map();
                            window.producerUserMap.set(response.consumerParameters.producerId, userId);
                            UIManager.showVolumeSliderByUserId(response.consumerParameters.producerId, userId);
                            VolumeBoostManager.attachToAudioElement(audioElement, userId, 1.0).catch(() => {});
                        }
                    } catch (error) {
                        console.error('Критическая ошибка создания консьюмера:', error);
                    }
                }
            );
            return true;
        } catch (error) {
            console.error('Критическая ошибка запроса consume:', error);
            this.pendingProducersRef.push(producerData);
            return false;
        }
    }

    _processPendingProducers() {
        if (this._isProcessingConsumers) return;
        this._isProcessingConsumers = true;
        if (!this.recvTransport || this.recvTransport.closed || this.recvTransport.connectionState === 'failed') {
            this._isProcessingConsumers = false;
            return;
        }
        const toProcess = [...this.pendingProducersRef];
        this.pendingProducersRef = [];
        const promises = toProcess.map((p) =>
            this.ensureConsumer(p.id || p.producerId, p).catch((e) => console.error('Критическая ошибка обработки продюсера:', e))
        );
        Promise.allSettled(promises).finally(() => {
            this._isProcessingConsumers = false;
            if (this.pendingProducersRef.length > 0) setTimeout(() => this._processPendingProducers(), 200);
        });
    }

    async initAutoConnect() {
        this.processUrlParams();
        try {
            const autoLoggedIn = await AuthManager.tryAutoLogin(this);
            if (autoLoggedIn) {
                await ServerManager.loadServers(this, false);
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
                            const roomExists = this.rooms?.some((r) => r.id === lastRoomId);
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
            AuthManager.showAuthModal(this);
        } catch (err) {
            console.error('Критическая ошибка автоподключения:', err);
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
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
                body: JSON.stringify({ userId: this.userId, token: this.token })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Не удалось присоединиться');
            }
            const data = await res.json();
            const server = data.server;
            if (!this.servers.some((s) => s.id === server.id)) this.servers.push(server);
            if (this.elements.serverSearchInput) this.elements.serverSearchInput.value = '';
            localStorage.setItem('lastServerId', server.id);
            ServerManager.renderServers(this);
            this.showPanel('servers');
            UIManager.addMessage('System', `✅ Вы присоединились к дереву "${server.name}"`);
            return true;
        } catch (error) {
            UIManager.showError(`❌ Не удалось присоединиться: ${error.message}`);
            return false;
        }
    }

    async clearUnreadForCurrentRoom() {
        if (!this.currentRoom) return;
        let serverId = this.currentServerId;
        if (!serverId || this.currentServer?.type === 'direct' || this.currentServerId?.startsWith('user_')) {
            serverId = this.currentRoom;
        }
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/messages/${this.currentRoom}/mark-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
                body: JSON.stringify({ serverId })
            });
            if (response.ok) UIManager.clearUnreadForRoom(serverId, this.currentRoom);
        } catch (error) {
            console.error('Критическая ошибка очистки непрочитанных:', error);
        }
    }

    setupSocketConnection() {
        const currentToken = this.token;
        if (!currentToken) return;
        if (this.socket && this.socket.connected) {
            if (this.currentRoom && this.socketRoom !== this.currentRoom) {
                this.destroySocket();
            } else {
                this.socket.emit('join-room', { roomId: this.currentRoom });
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
            
            socket.on('join-ack', (data) => {
                if (data.success) this.setConnectionState(CONNECTION_STATE.CONNECTED, this.currentRoom);
                else this.setConnectionState(CONNECTION_STATE.ERROR, this.currentRoom);
            });
            socket.on('user-speaking-state', (data) => {
                const { userId, speaking, timestamp } = data;
                MembersManager.updateMember(userId, { isMicActive: speaking, lastSpeakingUpdate: timestamp });
                UIManager.updateMemberMicState(userId, speaking);
                if (userId === this.userId) this.sendMicStateToElectron();
            });
            socket.on('user-presence-change', (data) => {
                const { userId, state, timestamp } = data;
                const connectionState = {
                    connected: 'connected', suspect: 'connecting', offline: 'disconnected', disconnected: 'disconnected'
                }[state] || 'unknown';
                MembersManager.setConnectionState(userId, connectionState);
                if (state === 'offline' && userId === this.userId) this._reconcileOfflineState();
            });
            socket.on('consumerParameters', async (data) => {
                if (!this.consumedProducerIdsRef.has(data.producerId)) {
                    try {
                        const { consumer, audioElement } = await MediaManager.createConsumer(this, data);
                        this.consumerState.set(data.producerId, { status: 'active', consumer, audioElement, lastError: null });
                        const members = MembersManager.getMembers();
                        const member = members.find((m) => m.clientId === data.peerId || m.userId === data.peerId);
                        const userId = member?.userId || data.peerId;
                        if (userId) {
                            if (!window.producerUserMap) window.producerUserMap = new Map();
                            window.producerUserMap.set(data.producerId, userId);
                            UIManager.showVolumeSliderByUserId(data.producerId, userId);
                            VolumeBoostManager.attachToAudioElement(audioElement, userId, 1.0).catch(() => {});
                        }
                    } catch (error) {
                        console.error('Критическая ошибка consumerParameters:', error);
                        this.consumerState.set(data.producerId, { status: 'error', consumer: null, lastError: error });
                    }
                }
            });
            socket.on('producerPaused', (data) => {
                const { producerId, peerId } = data;
                const state = this.consumerState.get(producerId);
                if (state?.audioElement) state.audioElement.muted = true;
                if (peerId) MembersManager.updateMember(peerId, { isMicActive: false });
                UIManager.updateMemberMicState(peerId, false);
            });
            socket.on('producerResumed', (data) => {
                const { producerId, peerId } = data;
                const state = this.consumerState.get(producerId);
                if (state?.audioElement) state.audioElement.muted = false;
                if (peerId) MembersManager.updateMember(peerId, { isMicActive: true });
                UIManager.updateMemberMicState(peerId, true);
            });
            socket.on('new-producer', async (data) => {
                if (data.clientID !== this.clientID && !this.consumedProducerIdsRef.has(data.producerId)) {
                    this.pendingProducersRef.push(data);
                    this._processPendingProducers();
                } else {
                    this.consumedProducerIdsRef.add(data.producerId);
                }
            });
            socket.on('current-producers', async (data) => {
                if (!data?.producers || !Array.isArray(data.producers)) return;
                for (const producer of data.producers) {
                    if (producer.clientID !== this.clientID && !this.consumedProducerIdsRef.has(producer.id)) {
                        this.pendingProducersRef.push(producer);
                    } else {
                        this.consumedProducerIdsRef.add(producer.id);
                    }
                }
                this._processPendingProducers();
            });
            socket.on('room-participants-updated', (data) => {
                MembersManager.updateAllMembersWithStatus(data.online || [], data.offline || []);
                this._reconcileParticipantsState(data);
            });
            socket.on('room-participants', (participants) => {
                const processed = participants.map((p) => (p.userId === this.userId ? { ...p, isOnline: true } : p));
                MembersManager.updateAllMembers(processed);
            });
            socket.on('user-joined', () => this.playSound('user-join'));
            socket.on('user-left', async (data) => {
                const memberElement = document.querySelector(`.member-item[data-user-id="${data.userId}"]`);
                if (memberElement) {
                    const slider = memberElement.querySelector('.member-volume-slider');
                    if (slider) { slider.style.display = 'none'; slider.dataset.producerId = ''; }
                    const micIndicator = memberElement.querySelector('.mic-indicator');
                    if (micIndicator) { micIndicator.className = 'mic-indicator'; micIndicator.title = 'Микрофон выключен'; }
                }
                this.playSound('user-leave');
            });
            socket.on('mic-indicator-update', (data) => {
                const { userId, isActive } = data;
                const member = MembersManager.getMember(userId);
                if (!member?.lastSpeakingUpdate || member.lastSpeakingUpdate < Date.now() - 2000) {
                    MembersManager.updateMember(userId, { isMicActive: isActive });
                    UIManager.updateMemberMicState(userId, isActive);
                }
            });
            socket.on('unread-update', (data) => {
                UIManager.setUnreadCount(data.serverId, data.roomId, data.count, data.hasMention, data.personalCount || 0);
            });
            socket.on('message-deleted', (data) => {
                UIManager.removeMessageFromUI(data.messageId);
            });
            socket.on('message-reaction-updated', (data) => {
                if (data?.messageId && data?.reactions) UIManager.updateMessageReactions(data.messageId, data.reactions);
            });
            socket.on('init-secondary-chat', async (data) => {
                if (data?.roomId && !this.secondaryChat.enabled) {
                    await SecondaryChatManager.toggle(this, 'side');
                    setTimeout(() => {
                        if (SecondaryChatManager.secondaryChat.enabled) SecondaryChatManager.joinRoom(this, data.roomId);
                    }, 150);
                }
            });
            socket.on('live-notification', (payload) => { UIManager.showLiveNotification(this, payload); });
            socket.on('new-message', (message) => {
                if (!message || !message.roomId) return;
                if (message.isForSecondary) {
                    if (SecondaryChatManager.secondaryChat.enabled && SecondaryChatManager.secondaryChat.roomId === message.roomId) {
                        SecondaryChatManager.addMessage(
                            message.username, message.text, message.timestamp, message.type || 'text',
                            message.imageUrl, message.id, message.readBy || [], message.userId, false, message.thumbnailUrl, message.replyTo, message.reactions || {}
                        );
                        if (message.type !== 'image' && message.username !== this.username) this.playSound('message');
                    }
                    return;
                }
                if (message.roomId === this.currentRoom) {
                    UIManager.addMessage(
                        message.username, message.text, message.timestamp, message.type || 'text',
                        message.imageUrl, message.id, message.readBy || [], message.userId,
                        message.broadcast || false, message.thumbnailUrl, null, message.replyTo, message.reactions || {}
                    );
                    if (message.type !== 'image' && message.username !== this.username) this.playSound('message');
                }
            });
            socket.on('messages-read-status', (updates) => {
                if (updates && Array.isArray(updates)) {
                    for (const { id, readBy } of updates) {
                        const msgEl = document.querySelector(`.message[data-message-id="${id}"]`);
                        if (msgEl && msgEl.dataset.userId === this.userId) UIManager.updateMessageReadStatus(id, readBy || []);
                    }
                }
            });
            socket.on('request-client-diagnostic', async ({ roomId, requestId }) => {
                if (roomId !== this.currentRoom) return;
                try {
                    const state = await this.gatherClientDiagnosticState();
                    socket.emit('client-diagnostic-response', { roomId, data: state });
                } catch (err) { console.error('Критическая ошибка диагностики:', err); }
            });
            socket.on('diagnostic-update', (snapshot) => {
                if (this.diagnosticActive) UIManager.renderDiagnosticSnapshot(snapshot);
            });
            socket.on('error', (error) => UIManager.showError('Ошибка соединения: ' + (error.message || 'неизвестная ошибка')));
            socket.on('connect', () => {
                UIManager.updateStatus('Подключено', 'connected');
                this.setConnectionState(CONNECTION_STATE.CONNECTED, this.currentRoom);
                if (this.currentRoom) {
                    socket.emit('join-room', { roomId: this.currentRoom });
                    socket.emit('request-mic-states', { roomId: this.currentRoom });
                }
                this.loadUnreadCounts();
                this.startPingInterval();
            });
            socket.on('disconnect', (reason) => {
                UIManager.updateStatus('Отключено', 'disconnected');
                this.setConnectionState(CONNECTION_STATE.DISCONNECTED, this.currentRoom);
                this.stopPingInterval();
                if (reason !== 'io client disconnect' && this.currentRoom && !this.isReconnecting) {
                    setTimeout(() => {
                        if (this.currentRoom && !this.isReconnecting && !this._reconnectInProgress) this.reconnectToRoom(this.currentRoom);
                    }, 2000);
                }
            });
        } catch (error) {
            console.error('Критическая ошибка подключения сокета:', error);
            UIManager.showError('Ошибка подключения к серверу');
            this.setConnectionState(CONNECTION_STATE.ERROR, this.currentRoom);
        }
    }

    async openSecondaryFromNotification(roomId) {
        if (!roomId) return;
        if (SecondaryChatManager.secondaryChat.enabled) {
            await SecondaryChatManager.joinRoom(this, roomId);
            return;
        }
        await SecondaryChatManager.openDirect(this, roomId);
    }

    async _reconcileOfflineState() {
        if (this.recvTransport && !this.recvTransport.closed && this.recvTransport.connectionState === 'connected') {
            let hasActiveMedia = false;
            for (const [, state] of this.consumerState) {
                if (state.status === 'active' && state.consumer?.track?.readyState === 'live') {
                    hasActiveMedia = true;
                    break;
                }
            }
            if (hasActiveMedia || (this.audioProducer && !this.audioProducer.closed)) {
                if (this.socket && this.currentRoom) {
                    this.socket.emit('request-room-snapshot', { roomId: this.currentRoom }, (response) => {
                        if (response?.success && response.participants) {
                            MembersManager.updateMember(this.userId, { isOnline: true, connectionState: 'connected' });
                            UIManager.updateMembersListWithStatus(
                                response.participants.filter((p) => p.isOnline),
                                response.participants.filter((p) => !p.isOnline)
                            );
                        }
                    });
                }
            }
        }
    }

    _reconcileParticipantsState(serverData) {
        const { online = [], offline = [] } = serverData;
        const serverOnlineIds = new Set(online.map((p) => p.userId));
        for (const [producerId, state] of this.consumerState) {
            if (state.status === 'active') {
                const userId = window.producerUserMap?.get(producerId);
                if (userId && !serverOnlineIds.has(userId)) {}
            }
        }
        if (!serverOnlineIds.has(this.userId)) this._reconcileOfflineState();
    }

    startPingInterval() {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            if (this.socket && this.socket.connected) this.socket.emit('ping');
        }, PING_INTERVAL);
    }

    stopPingInterval() {
        if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    }

    async loadUnreadCounts() {
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/messages/unread`, {
                headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.unread) UIManager.syncUnreadCounts(data.unread);
            }
        } catch (error) {
            console.error('Критическая ошибка загрузки непрочитанных:', error);
        }
    }

    destroySocket() {
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        this.socketRoom = null;
        this.stopPingInterval();
    }

    updateMicButtonState() {
        let status;
        if (!this.isConnected) status = 'disconnected';
        else if (this.isMicPaused) status = 'paused';
        else if (this.isMicActive) status = 'active';
        else status = 'connected';
        UIManager.updateMicButton(status);
    }

    async toggleMicrophone() {
        if (this._micToggleDebounce) return;
        this._micToggleDebounce = setTimeout(() => { this._micToggleDebounce = null; }, 500);
        try {
            if (!this.currentRoom) { UIManager.showError('Микрофон доступен только в гнёздах'); return; }
            await MediaManager.toggleMicrophone(this);
            this.updateMicButtonState();
            if (this.isMicActive && !this.isMicPaused) this.playSound('mic-on');
            else if (this.isMicPaused) this.playSound('mic-off');
            this.sendMicStateToElectron();
        } catch (error) {
            console.error('Критическая ошибка микрофона:', error);
            UIManager.showError('Ошибка микрофона: ' + error.message);
            this.updateMicButtonState();
        }
    }

    sendMessage(text) {
        if (!text.trim() || !this.currentRoom) return;
        const trimmedText = text.trim();
        const replyTarget = UIManager.replyTarget ? {
            id: UIManager.replyTarget.id, userId: UIManager.replyTarget.userId,
            username: UIManager.replyTarget.username, text: UIManager.replyTarget.text
        } : null;
        UIManager.clearReplyTarget();
        if (this.socket) {
            this.socket.emit('send-message', { roomId: this.currentRoom, text: trimmedText, replyTo: replyTarget });
        } else {
            TextChatManager.sendMessage(this, trimmedText, 'text', replyTarget).catch(() => UIManager.showError('Ошибка отправки сообщения'));
        }
    }

    async sendSecondaryMessage(text, targetRoomId, replyTo = null) {
        const roomId = targetRoomId || SecondaryChatManager.secondaryChat.roomId;
        if (!roomId || !text.trim()) return;
        const tempId = `temp_sec_${Date.now()}`;
        SecondaryChatManager.addMessage(this.username, text.trim(), null, 'text', null, tempId, [], this.userId, false, null, replyTo, {});
        const payloadReplyTo = replyTo ? { id: replyTo.id, username: replyTo.username } : null;
        try {
            if (this.socket && this.socket.connected) {
                this.socket.emit('send-message', { roomId, text: text.trim(), replyTo: payloadReplyTo });
                return;
            }
            const result = await TextChatManager.sendMessageToRoom(this, roomId, text.trim(), 'text', payloadReplyTo);
            if (result && result.message) {
                const tempEl = document.querySelector(`[data-message-id="${tempId}"]`);
                if (tempEl) {
                    tempEl.dataset.messageId = result.message.id;
                    const timeEl = tempEl.querySelector('.message-time');
                    if (timeEl && result.message.timestamp) timeEl.textContent = new Date(result.message.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                }
            }
        } catch (error) {
            console.error('Критическая ошибка отправки во второй чат:', error);
            UIManager.showError('Не удалось отправить сообщение');
            const tempEl = document.querySelector(`[data-message-id="${tempId}"]`);
            if (tempEl) tempEl.remove();
        }
    }

    async toggleReaction(messageId, emoji) {
        if (!messageId || !emoji || !this.currentRoom) return;
        try {
            if (this.socket?.connected) {
                this.socket.emit('toggle-reaction', { messageId, emoji, roomId: this.currentRoom });
            } else {
                await this.sendReactionFallback(messageId, emoji);
            }
        } catch (error) {
            console.error('Ошибка отправки реакции:', error);
            UIManager.showError('Не удалось отправить реакцию');
        }
    }

    async sendReactionFallback(messageId, emoji) {
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/messages/${messageId}/reaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
                body: JSON.stringify({ emoji })
            });
            if (!response.ok) throw new Error('Fallback reaction failed');
        } catch (error) {
            console.error('Критическая ошибка фоллбэка реакции:', error);
        }
    }

async joinRoom(roomId, clearUnread = true) {
    if (this.currentRoom === roomId && this.isConnected && this.socket?.connected) {
        this._processPendingProducers();
        return true;
    }
    
    this._abortMediaRequests();
    this.setConnectionState(CONNECTION_STATE.CONNECTING, roomId);
    this._joinRoomInProgress = true;
    this.pendingProducersRef = [];
    this.consumedProducerIdsRef.clear();
    this.consumerState.clear();
    this._isProcessingConsumers = false;
    
    try {
        if (this.currentRoom && this.currentRoom !== roomId) {
            if (this.socket) this.socket.emit('leave-room', { roomId: this.currentRoom });
        }
        
        await this.disconnectFromRoom();
        
        const joinRes = await this._fetchWithTimeout(
            this.CHAT_API_URL,
            { method: 'POST', body: JSON.stringify({ roomId, userId: this.userId, token: this.token, clientId: this.clientID }) }
        );
        const joinData = await joinRes.json();
        if (!joinData.success) throw new Error(joinData.error || 'Join failed');
        if (!joinData.mediaData) throw new Error('No media data received');
        
        this.clientID = joinData.clientId;
        this.mediaData = joinData.mediaData;
        this.currentRoom = roomId;
        this.roomType = 'voice';
        localStorage.setItem('lastServerId', this.currentServerId);
        localStorage.setItem('lastRoomId', this.currentRoom);
        this.audioProducer = null;
        
        this.setupSocketConnection();
        
        let attempts = 0;
        while (!this.socket?.connected && attempts < 50) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            attempts++;
        }
        if (!this.socket?.connected) throw new Error('WebSocket не подключился после 5 секунд');
        
        await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(), 2000);
            const joinHandler = () => { clearTimeout(timeout); resolve(); };
            this.socket.once('join-ack', joinHandler);
            this.socket.emit('join-room', { roomId });
        });
        
        await MediaManager.connect(this, roomId, joinData.mediaData);
        
        if (this.recvTransport?.connectionState === 'connected') {
            this._processPendingProducers();
        } else if (this.recvTransport) {
            this.recvTransport.once('connectionstatechange', (state) => {
                if (state === 'connected') this._processPendingProducers();
            });
        }
        
        this.updateMicButtonState();
        if (this.socket) this.socket.emit('request-mic-states', { roomId });
        await UIManager.updateRoomUI(this);
        TextChatManager.joinTextRoom(this, roomId);
        this.resetHistoryState();
        
        // ====================================================================
        // 🔥 ИСПРАВЛЕННАЯ ЛОГИКА ЗАГРУЗКИ ИСТОРИИ
        // ====================================================================
        
        if (!this.token) throw new Error('Токен отсутствует');
        
        // 1. Получаем сохранённую позицию скролла
        let savedMessageId = null;
        try {
            const response = await fetch(`${this.API_SERVER_URL}/api/messages/${roomId}/view-position`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                savedMessageId = data.messageId;
                console.log(`[VoiceChatClient] Найдена сохранённая позиция: ${savedMessageId}`);
            }
        } catch (e) {
            console.error('[VoiceChatClient] Ошибка загрузки позиции скролла:', e);
        }
        
        // 2. ВСЕГДА сначала загружаем последние 100 сообщений
        console.log('[VoiceChatClient] Загружаем последние 100 сообщений...');
        const result = await TextChatManager.loadMessages(this, roomId, 100);
        
        if (result && result.messages?.length > 0) {
            this.oldestMessageId = result.messages[0].id;
            this.hasMoreHistory = result.hasMore;
            console.log(`[VoiceChatClient] Загружено ${result.messages.length} сообщений, hasMore: ${result.hasMore}`);
        } else {
            console.log('[VoiceChatClient] Нет сообщений в комнате');
            this.hasMoreHistory = false;
        }
        
        // 3. Если есть сохранённая позиция, скроллим к ней
        if (savedMessageId) {
            setTimeout(() => {
                const found = UIManager.scrollToMessage(savedMessageId, null, true);
                if (found) {
                    console.log(`[VoiceChatClient] Скролл к сохранённому сообщению: ${savedMessageId}`);
                } else {
                    console.log(`[VoiceChatClient] Сохранённое сообщение ${savedMessageId} не найдено в загруженных`);
                    // Опционально: можно догрузить вокруг этого сообщения
                    TextChatManager.loadMessagesAround(this, roomId, savedMessageId, 50).then(() => {
                        UIManager.scrollToMessage(savedMessageId, null, true);
                    }).catch(err => {
                        console.error('[VoiceChatClient] Ошибка дозагрузки вокруг:', err);
                        UIManager.scrollToBottom();
                    });
                }
            }, 200);
        } else {
            // Нет сохранённой позиции - скроллим вниз
            setTimeout(() => UIManager.scrollToBottom(), 200);
        }
        
        // 4. Инициализируем отслеживание скролла
        UIManager.initScrollTracker(roomId);
        
        // 5. Настраиваем Observer для подгрузки истории при скролле вверх
        if (this.hasMoreHistory) {
            this.initHistoryObserver();
        } else {
            this.removeHistorySentinel();
        }
        
        // 6. Очищаем непрочитанные
        if (clearUnread) {
            await this.clearUnreadForCurrentRoom();
        }
        
        this.setConnectionState(CONNECTION_STATE.CONNECTED, roomId);
        this.isConnected = true;
        this.sendMicStateToElectron();
        return true;
        
    } catch (error) {
        console.error('Критическая ошибка входа в комнату:', error);
        this._joinRoomInProgress = false;
        this.setConnectionState(CONNECTION_STATE.ERROR, roomId);
        UIManager.updateStatus('Ошибка: ' + error.message, 'disconnected');
        UIManager.showError('Не удалось занять гнездо: ' + error.message);
        throw error;
    } finally {
        this._joinRoomInProgress = false;
    }
}

    async disconnectFromRoom() {
        if (this.currentRoom) {
            console.log('[History] 🚪 disconnectFromRoom: очистка состояния истории');
            if (this.socket) this.socket.emit('leave-room', { roomId: this.currentRoom });
            MediaManager.disconnect(this);
            TextChatManager.leaveTextRoom(this, this.currentRoom);
            MembersManager.clearMembers();
            this.destroySocket();
            this.removeHistorySentinel();
            this.hasMoreHistory = true;
            this.isHistoryLoading = false;
            this.oldestMessageId = null;
            const oldRoom = this.currentRoom;
            this.currentRoom = null;
            this.isConnected = false;
            this.isMicActive = false;
            this.isMicPaused = false;
            this.pendingProducersRef = [];
            this.consumedProducerIdsRef.clear();
            this.consumerState.clear();
            this.updateMicButtonState();
            this.setConnectionState(CONNECTION_STATE.DISCONNECTED);
            this.sendMicStateToElectron();
            const container = document.querySelector('.messages-container');
            if (container) {
                container._scrollTrackerBound = false;
                delete container._scrollSaveTimeout;
                delete container._readCheckTimeout;
            }
        }
    }

    async reconnectToRoom(roomId, maxRetries = 3, retryDelay = 2000, clearUnread = false, force = false) {
        if (!force && this.currentRoom === roomId && this.isConnected && this.socket?.connected) {
            this._processPendingProducers();
            return true;
        }
        const wasMicUnmuted = this.isMicActive && !this.isMicPaused;
        this.wasMicActiveBeforeReconnect = wasMicUnmuted;
        if (this.isMicActive && this.mediaData) await MediaManager.stopMicrophone(this);
        await this.leaveRoom();
        this.isReconnecting = true;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await new Promise((r) => setTimeout(r, attempt === 1 ? 500 : retryDelay));
                const result = await this.joinRoom(roomId, clearUnread);
                this.isReconnecting = false;
                if (this.wasMicActiveBeforeReconnect && this.mediaData) {
                    setTimeout(async () => {
                        try {
                            await MediaManager.resumeMicrophone(this);
                            this.updateMicButtonState();
                        } catch (e) {
                            console.error('Критическая ошибка возобновления микрофона:', e);
                        }
                    }, 3000);
                }
                return result;
            } catch (error) {
                const isTransient =
                    error.message.includes('404') || error.message.includes('502') ||
                    error.message.includes('503') || error.message.includes('504') ||
                    error.message.includes('Abort') || error.message.includes('Failed to fetch');
                if (!isTransient || attempt === maxRetries) {
                    console.error('Критическая ошибка переподключения:', error);
                    this.isReconnecting = false;
                    UIManager.addMessage('System', '❌ Не удалось подключиться к гнезду');
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
            if (this.socket) this.socket.emit('leave-room', { roomId: this.currentRoom });
            if (this.isConnected) MediaManager.disconnect(this);
            await fetch(`${this.API_SERVER_URL}/api/media/rooms/${this.currentRoom}/leave`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }
            });
            document.querySelectorAll('.member-volume-slider').forEach((s) => {
                s.style.display = 'none';
                s.dataset.producerId = '';
            });
            MembersManager.clearMembers();
            this.currentRoom = null;
            this.roomType = null;
            UIManager.updateRoomUI(this);
            this.setConnectionState(CONNECTION_STATE.DISCONNECTED);
            this.sendMicStateToElectron();
            return true;
        } catch (error) {
            console.error('Критическая ошибка выхода из комнаты:', error);
            UIManager.showError('Ошибка при покидании гнезда: ' + error.message);
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

    async toggleSecondaryChat(direction = 'side') {
        await SecondaryChatManager.toggle(this, direction);
        if (this.socket?.connected) {
            if (SecondaryChatManager.secondaryChat.enabled) {
                if (SecondaryChatManager.secondaryChat.roomId) {
                    this.socket.emit('secondary-chat-update', { roomId: SecondaryChatManager.secondaryChat.roomId });
                }
            } else {
                this.socket.emit('secondary-chat-close');
            }
        }
        if (SecondaryChatManager.secondaryChat.enabled && SecondaryChatManager.secondaryChat.roomId) {
            localStorage.setItem('secondaryChatRoom', SecondaryChatManager.secondaryChat.roomId);
        } else {
            localStorage.removeItem('secondaryChatRoom');
        }
    }

    setupElectronBridge() {
        this._electronMessageHandler = this.handleElectronMessage.bind(this);
        window.addEventListener('message', this._electronMessageHandler);
    }

    handleElectronMessage(event) {
        if (!event.data || event.data.source !== 'electron') return;
        const { channel, data } = event.data;
        switch (channel) {
            case 'toggle-mic':
                if (data.active === true && this.isMicPaused) {
                    MediaManager.resumeMicrophone(this).then(() => this.updateMicButtonState());
                } else if (data.active === false && !this.isMicPaused) {
                    MediaManager.pauseMicrophone(this).then(() => this.updateMicButtonState());
                } else if (data.active === undefined) {
                    this.toggleMicrophone();
                }
                setTimeout(() => this.sendMicStateToElectron(), 100);
                break;
            case 'electron-ready':
                this.sendMicStateToElectron();
                break;
        }
    }

    sendMicStateToElectron() {
        const state = {
            active: this.isMicActive && !this.isMicPaused,
            muted: !this.isMicActive || this.isMicPaused,
            connected: this.isConnected,
            speaking: false
        };
        window.parent.postMessage({ channel: 'mic-state', state, source: 'webclient' }, '*');
    }

    startDiagnostic() {
        if (!this.currentRoom || this.diagnosticActive || !this.socket?.connected) return;
        this.diagnosticActive = true;
        this.socket.emit('start-room-diagnostic', { roomId: this.currentRoom });
        DiagnosticPanel.open(this);
    }

    stopDiagnostic() {
        if (!this.diagnosticActive) return;
        this.diagnosticActive = false;
        this.socket.emit('stop-room-diagnostic', { roomId: this.currentRoom });
        DiagnosticPanel.close();
    }

    async gatherClientDiagnosticState() {
        let consumersPlaying = 0;
        let consumersTotal = 0;
        if (this.consumerState) {
            consumersTotal = this.consumerState.size;
            for (const [, state] of this.consumerState.entries()) {
                const el = state.audioElement;
                if (state.consumer?.track?.readyState === 'live' && el && !el.muted && !el.paused) {
                    consumersPlaying++;
                }
            }
        }
        return {
            userId: this.userId,
            username: this.username,
            isMicActive: this.isMicActive && !this.isMicPaused,
            micTrackState: this.audioProducer?.track?.readyState || 'inactive',
            isTabHidden: document.hidden,
            consumersPlaying,
            consumersTotal,
            timestamp: Date.now()
        };
    }
}

export default VoiceChatClient;
