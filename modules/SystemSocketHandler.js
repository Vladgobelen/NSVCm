// modules/SystemSocketHandler.js
import UIManager from './UIManager.js';
import MembersManager from './MembersManager.js';
import SoundManager from './SoundManager.js';
import SecondaryChatManager from './SecondaryChatManager.js';
import DiagnosticPanel from './DiagnosticPanel.js';

const CONNECTION_STATE = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
};

class SystemSocketHandler {
    constructor(client) {
        this.client = client;
    }

    registerHandlers(socket) {
        socket.on('join-ack', this.handleJoinAck.bind(this));
        socket.on('user-presence-change', this.handleUserPresenceChange.bind(this));
        socket.on('user-joined', this.handleUserJoined.bind(this));
        socket.on('user-left', this.handleUserLeft.bind(this));
        socket.on('room-participants-updated', this.handleRoomParticipantsUpdated.bind(this));
        socket.on('room-participants', this.handleRoomParticipants.bind(this));
        socket.on('unread-update', this.handleUnreadUpdate.bind(this));
        socket.on('connect', this.handleConnect.bind(this));
        socket.on('disconnect', this.handleDisconnect.bind(this));
        socket.on('request-client-diagnostic', this.handleRequestClientDiagnostic.bind(this));
        socket.on('diagnostic-update', this.handleDiagnosticUpdate.bind(this));
        socket.on('error', this.handleError.bind(this));
        socket.on('live-notification', this.handleLiveNotification.bind(this));
        socket.on('personal-notification', this.handlePersonalNotification.bind(this));
        socket.on('init-secondary-chat', this.handleInitSecondaryChat.bind(this));
        socket.on('room-snapshot', this.handleRoomSnapshot.bind(this));
        socket.on('ice-restart-result', () => {});
    }

    handleJoinAck(data) {
        if (data.success) this.client.setConnectionState(CONNECTION_STATE.CONNECTED, this.client.currentRoom);
        else this.client.setConnectionState(CONNECTION_STATE.ERROR, this.client.currentRoom);
    }

    handleUserPresenceChange(data) {
        const { userId, state } = data;
        const connectionState = {
            connected: 'connected',
            suspect: 'connecting',
            offline: 'disconnected',
            disconnected: 'disconnected'
        }[state] || 'unknown';
        MembersManager.setConnectionState(userId, connectionState);
        if (state === 'offline' && userId === this.client.userId) {
            this.client._reconcileOfflineState();
        }
    }

    handleUserJoined() {
        SoundManager.playSound(SoundManager.SoundTypes.SOUND_USER_JOIN);
    }

    handleUserLeft(data) {
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
        SoundManager.playSound(SoundManager.SoundTypes.SOUND_USER_LEAVE);
    }

    handleRoomParticipantsUpdated(data) {
        MembersManager.updateAllMembersWithStatus(data.online || [], data.offline || []);
        this.client._reconcileParticipantsState(data);
    }

    handleRoomParticipants(participants) {
        const processed = participants.map((p) => (p.userId === this.client.userId ? { ...p, isOnline: true } : p));
        MembersManager.updateAllMembers(processed);
    }

    handleUnreadUpdate(data) {
        UIManager.setUnreadCount(data.serverId, data.roomId, data.count, data.hasMention, data.personalCount || 0);
        if (data.roomId === this.client.currentRoom) {
            UIManager.updateScrollButtonCounter(this.client.currentRoom);
        }
    }

    handleConnect() {
        UIManager.updateStatus('Подключено', 'connected');
        this.client.setConnectionState(CONNECTION_STATE.CONNECTED, this.client.currentRoom);
        
        if (this.client.currentRoom) {
            const socket = this.client.socket;
            socket.emit('join-room', { roomId: this.client.currentRoom });
            socket.emit('request-mic-states', { roomId: this.client.currentRoom });
            this.client.fetchPinnedMessages(this.client.currentRoom);
            
            if (this.client.transportRecoveryState.has('socket')) {
                UIManager.addMessage('System', '🔄 Соединение с сервером восстановлено', null, 'system');
                SoundManager.playSound(SoundManager.SoundTypes.SOUND_USER_JOIN);
                this.client._resetSocketReconnectState();
            }
        }
        this.client.loadUnreadCounts();
        this.client.startPingInterval();
    }

    handleDisconnect(reason) {
        UIManager.updateStatus('Отключено', 'disconnected');
        this.client.setConnectionState(CONNECTION_STATE.DISCONNECTED, this.client.currentRoom);
        this.client.stopPingInterval();
        this.client._transportReadyForConsume = false;
        
        if (reason === 'io client disconnect') {
            this.client._resetSocketReconnectState();
            return;
        }
        if (this.client.currentRoom) {
            this.client._scheduleSocketReconnect(reason);
        }
    }

    async handleRequestClientDiagnostic({ roomId }) {
        if (roomId !== this.client.currentRoom) return;
        try {
            const state = await this.client.gatherClientDiagnosticState();
            state.recoveryInfo = {
                consumerRecovery: Array.from(this.client.consumerRecoveryState.entries()).map(([id, s]) => ({
                    producerId: id.substring(0, 8),
                    attempts: s.attempts,
                    exhausted: s.exhausted || false
                })),
                iceRestart: Array.from(this.client.iceRestartState.entries()).map(([id, s]) => ({
                    transportId: id.substring(0, 8),
                    attempts: s.attempts
                })),
                pendingConsumeQueue: this.client._producersPendingConsume.length,
                transportReady: this.client._transportReadyForConsume
            };
            this.client.socket.emit('client-diagnostic-response', { roomId, data: state });
        } catch (err) {}
    }

    handleDiagnosticUpdate(snapshot) {
        if (this.client.diagnosticActive) {
            UIManager.renderDiagnosticSnapshot(snapshot);
        }
    }

    handleError(error) {
        UIManager.showError('Ошибка соединения: ' + (error.message || 'неизвестная ошибка'));
    }

    handleLiveNotification(payload) {
        SoundManager.playSound(SoundManager.SoundTypes.SOUND_POPUP);
        UIManager.showLiveNotification(this.client, payload);
    }

handlePersonalNotification(payload) {
    console.log('🔔 [PERSONAL] ========== НАЧАЛО ОБРАБОТКИ ==========');
    console.log('🔔 [PERSONAL] Получен payload:', JSON.stringify(payload, null, 2));
    console.log('🔔 [PERSONAL] currentRoom:', this.client.currentRoom);
    console.log('🔔 [PERSONAL] roomId из payload:', payload.roomId);
    
    let shouldShowBanner = false;
    let soundType = null;

    if (payload.type === 'reply') {
        console.log('🔔 [PERSONAL] Тип: reply');
        shouldShowBanner = SoundManager.shouldNotify(SoundManager.SoundTypes.NOTIFY_REPLY);
        soundType = SoundManager.SoundTypes.SOUND_REPLY;
        console.log('🔔 [PERSONAL] NOTIFY_REPLY enabled:', shouldShowBanner);
    } else if (payload.type === 'mention' || payload.type === 'name_mention') {
        console.log('🔔 [PERSONAL] Тип: mention/name_mention');
        shouldShowBanner = SoundManager.shouldNotify(SoundManager.SoundTypes.NOTIFY_MENTION);
        soundType = SoundManager.SoundTypes.SOUND_MENTION;
        console.log('🔔 [PERSONAL] NOTIFY_MENTION enabled:', shouldShowBanner);
    } else if (payload.isDirectMessage) {
        console.log('🔔 [PERSONAL] Тип: direct message');
        shouldShowBanner = SoundManager.shouldNotify(SoundManager.SoundTypes.NOTIFY_DM);
        soundType = SoundManager.SoundTypes.SOUND_DM;
        console.log('🔔 [PERSONAL] NOTIFY_DM enabled:', shouldShowBanner);
    } else {
        console.log('🔔 [PERSONAL] Неизвестный тип payload:', payload.type);
    }

    console.log('🔔 [PERSONAL] shouldShowBanner итог:', shouldShowBanner);
    console.log('🔔 [PERSONAL] soundType итог:', soundType);

    if (shouldShowBanner) {
        console.log('🔔 [PERSONAL] ВЫЗЫВАЕМ UIManager.showLiveNotification');
        UIManager.showLiveNotification(this.client, payload);
    } else {
        console.log('🔔 [PERSONAL] ПРОПУСКАЕМ баннер (shouldShowBanner = false)');
    }

    const isCurrentContext = payload.roomId === this.client.currentRoom;
    console.log('🔔 [PERSONAL] isCurrentContext:', isCurrentContext, `(${payload.roomId} === ${this.client.currentRoom})`);

    if (soundType && !isCurrentContext) {
        console.log('🔔 [PERSONAL] ВОСПРОИЗВОДИМ звук:', soundType);
        SoundManager.playSound(soundType);
    } else if (soundType && isCurrentContext) {
        console.log('🔔 [PERSONAL] ПРОПУСКАЕМ звук (текущий контекст)');
    } else if (!soundType) {
        console.log('🔔 [PERSONAL] Нет soundType для воспроизведения');
    }
    
    console.log('🔔 [PERSONAL] ========== КОНЕЦ ОБРАБОТКИ ==========');
}

    async handleInitSecondaryChat(data) {
        if (data?.roomId && !this.client.secondaryChat.enabled) {
            const direction = SecondaryChatManager.getDirection();
            await SecondaryChatManager.toggle(this.client, direction);
            setTimeout(() => {
                if (SecondaryChatManager.secondaryChat.enabled) {
                    SecondaryChatManager.joinRoom(this.client, data.roomId);
                }
            }, 150);
        }
    }

    handleRoomSnapshot(data) {
        if (data?.producers && Array.isArray(data.producers)) {
            for (const producer of data.producers) {
                if (producer.clientID !== this.client.clientID && !this.client.consumedProducerIdsRef.has(producer.id)) {
                    this.client.pendingProducersRef.push(producer);
                }
            }
            this.client._processPendingProducers();
        }
    }
}

export default SystemSocketHandler;
