import TextChatManager from './TextChatManager.js';
import MembersManager from './MembersManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';
import ScrollTracker from './ScrollTracker.js';
import MessageRenderer from './MessageRenderer.js';
import ContextMenuManager from './ContextMenuManager.js';
import ReplyManager from './ReplyManager.js';
import UnreadBadgeManager from './UnreadBadgeManager.js';
import SecondaryChatManager from './SecondaryChatManager.js';
import MemberListRenderer from './MemberListRenderer.js';
import DiagnosticPanel from './DiagnosticPanel.js';
import ModalManager from './ModalManager.js';

class UIManager {
    static client = null;
    static usernameCache = new Map();
    static connectionStatusMap = new Map();
    static notificationTimer = null;
    static _tooltipsInitialized = false;

    static get secondaryChat() {
        return SecondaryChatManager.secondaryChat;
    }

    static get replyTarget() {
        return ReplyManager.getReplyTarget();
    }

    static set replyTarget(val) {
        val ? ReplyManager.setReplyTarget(val) : ReplyManager.clearReplyTarget();
    }

    static setClient(client) {
        this.client = client;
        ScrollTracker.setClient(client);
        MessageRenderer.setClient(client);
        UnreadBadgeManager.setClient(client);
        this._initReactionTooltips();
    }

static _initReactionTooltips() {
    if (this._tooltipsInitialized) return;
    this._tooltipsInitialized = true;

    if (!document.getElementById('reaction-tooltip-global')) {
        const tooltip = document.createElement('div');
        tooltip.id = 'reaction-tooltip-global';
        tooltip.className = 'reaction-tooltip';
        document.body.appendChild(tooltip);
    }

    const container = document.querySelector('.messages-container');
    if (!container) return;

    container.addEventListener('mouseenter', async (e) => {
        const pill = e.target.closest('.reaction-pill');
        if (!pill) return;

        const tooltip = document.getElementById('reaction-tooltip-global');
        if (!tooltip) return;

        const userIds = pill.dataset.userIds || '';
        if (!userIds) return;

        const ids = userIds.split(',');
        
        // 🔥 ПРОВЕРЯЕМ КЭШ И ЗАГРУЖАЕМ НЕДОСТАЮЩИЕ ИМЕНА
        const missingIds = ids.filter(uid => !this.usernameCache.has(uid));
        
        if (missingIds.length > 0) {
            tooltip.textContent = 'Загрузка...';
            tooltip.style.display = 'block';
            const rect = pill.getBoundingClientRect();
            tooltip.style.left = `${rect.left}px`;
            tooltip.style.top = `${rect.top - 35}px`;
            
            // Загружаем имена
            await this.fetchUsernames(missingIds);
        }
        
        // 🔥 ФОРМИРУЕМ ИМЕНА ТОЛЬКО ИЗ КЭША
        const names = ids.map(uid => {
            const name = this.usernameCache.get(uid);
            // Если имени нет даже после загрузки, показываем "Пользователь"
            return name || 'Пользователь';
        }).join(', ');
        
        tooltip.textContent = names;
        tooltip.style.display = 'block';
        const rect = pill.getBoundingClientRect();
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.top - 35}px`;
    }, true);

    container.addEventListener('mouseleave', (e) => {
        const pill = e.target.closest('.reaction-pill');
        if (!pill) return;
        const tooltip = document.getElementById('reaction-tooltip-global');
        if (tooltip) tooltip.style.display = 'none';
    }, true);
}

    static setupScrollToBottomButton() {
        ScrollTracker.setupScrollToBottomButton();
    }

    static _checkScrollVisibility(container) {
        ScrollTracker._checkScrollVisibility(container);
    }

    static scrollToBottom(container = null) {
        ScrollTracker.scrollToBottom(container);
    }

    static scrollToMessage(messageId, container = null, highlight = true) {
        ScrollTracker.scrollToMessage(messageId, container, highlight);
    }

    static initScrollTracker(roomId, container = null) {
        ScrollTracker.initScrollTracker(roomId, container);
    }

    static saveLastViewedMessage(roomId, container = null) {
        ScrollTracker.saveLastViewedMessage(roomId, container);
    }

    static getLastViewedMessage(roomId) {
        return ScrollTracker.getLastViewedMessage(roomId);
    }

    static clearLastViewedMessage(roomId) {
        ScrollTracker.clearLastViewedMessage(roomId);
    }

    static setReplyTarget(msg) {
        ReplyManager.setReplyTarget(msg);
    }

    static clearReplyTarget() {
        ReplyManager.clearReplyTarget();
    }

    static getReplyTarget() {
        return ReplyManager.getReplyTarget();
    }

    static showMessageContextMenu(event, messageId, userId, username, timestamp, messageObj = null) {
        ContextMenuManager.showMessageContextMenu(event, messageId, userId, username, timestamp, messageObj);
    }

    static showMemberContextMenu(event, userId, username) {
        ContextMenuManager.showMemberContextMenu(event, userId, username);
    }

    static hideContextMenu() {
        ContextMenuManager.hideContextMenu();
    }

    static addMessage(...args) {
        return MessageRenderer.addMessage(...args);
    }

    static prependMessage(...args) {
        return MessageRenderer.prependMessage(...args);
    }

    static prependMessageToContainer(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readState = 0, userId = null, broadcast = false, thumbnailUrl = null, container = null, replyTo = null) {
        return MessageRenderer.prependMessage(user, text, timestamp, type, imageUrl, messageId, readState, userId, broadcast, thumbnailUrl, replyTo);
    }

    static prependMessagesBatch(messages) {
        MessageRenderer.prependMessagesBatch(messages);
    }

    static clearContainerMessages(container = null) {
        MessageRenderer.clearContainerMessages(container);
    }

    static openImageModal(imageUrl) {
        MessageRenderer.openImageModal(imageUrl);
    }

    static updateMessageReadStatus(messageId, readData) {
        MessageRenderer.updateMessageReadStatus(messageId, readData);
    }

    static updateMessageReactions(messageId, reactions) {
        MessageRenderer.updateMessageReactions(messageId, reactions);
    }

    static toggleReaction(messageId, emoji) {
        if (this.client && typeof this.client.toggleReaction === 'function') {
            this.client.toggleReaction(messageId, emoji);
        }
    }

    static removeMessageFromUI(messageId) {
        MessageRenderer.removeMessageFromUI(messageId);
    }

    static highlightCodeBlocks(container = null) {
        return MessageRenderer.highlightCodeBlocks(container);
    }

    static handleReplyClick(messageId) {
        return MessageRenderer.handleReplyClick(messageId);
    }

    static async showMessageInfo(messageId, userId, username, timestamp) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/messages/${this.client.currentRoom}/${messageId}/info`, {
                headers: { Authorization: `Bearer ${this.client.token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error('Не удалось получить информацию');
            const data = await response.json();
            const message = data.message;
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';
            const content = document.createElement('div');
            content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; border: 1px solid #404060;';
            content.innerHTML = `
                <h3 style="margin: 0 0 20px 0; color: #e0e0e0;">📋 Информация о сообщении</h3>
                <div style="color: #b0b0c0; line-height: 1.8;">
                    <div><strong>ID:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.id}</code></div>
                    <div style="margin-top: 12px;"><strong>Автор:</strong> ${this.escapeHtml(message.username)}</div>
                    <div style="margin-top: 8px;"><strong>ID автора:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.userId}</code></div>
                    <div style="margin-top: 8px;"><strong>Время:</strong> ${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
                    <div style="margin-top: 8px;"><strong>Тип:</strong> ${message.type || 'text'}</div>
                    <div style="margin-top: 8px;"><strong>Гнездо:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.roomId}</code></div>
                    ${message.text ? `<div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px;"><strong>Текст:</strong><br><span style="color: #e0e0e0;">${this.escapeHtml(message.text)}</span></div>` : ''}
                </div>
                <button id="closeInfoModal" style="margin-top: 20px; padding: 10px 24px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Закрыть</button>
            `;
            modal.appendChild(content);
            document.body.appendChild(modal);
            const closeBtn = content.querySelector('#closeInfoModal');
            closeBtn.addEventListener('click', () => { modal.remove(); });
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        } catch (error) {
            this.showError('Не удалось получить информацию о сообщении');
        }
    }

    static async confirmDeleteMessage(messageId) {
        const confirmed = confirm('Вы уверены, что хотите удалить это сообщение? Это действие нельзя отменить.');
        if (!confirmed) return;
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/messages/${this.client.currentRoom}/${messageId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${this.client.token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Не удалось удалить сообщение');
            }
        } catch (error) {
            this.showError('Не удалось удалить сообщение: ' + error.message);
        }
    }

    static showReplyInfoModal(message) {
        MessageRenderer.showReplyInfoModal(message);
    }

    static syncUnreadCounts(serverData) {
        UnreadBadgeManager.syncUnreadCounts(serverData);
    }

    static setUnreadCount(serverId, roomId, count, hasMention, personalCount = 0) {
        UnreadBadgeManager.setUnreadCount(serverId, roomId, count, hasMention, personalCount);
    }

    static clearUnreadForServer(serverId) {
        UnreadBadgeManager.clearUnreadForServer(serverId);
    }

    static clearUnreadForRoom(serverId, roomId) {
        UnreadBadgeManager.clearUnreadForRoom(serverId, roomId);
    }

    static clearAllUnread() {
        UnreadBadgeManager.clearAllUnread();
    }

    static updateServerBadges() {
        UnreadBadgeManager.updateServerBadges();
    }

    static updateRoomBadges() {
        UnreadBadgeManager.updateRoomBadges();
    }

    static updateTotalBadge() {
        UnreadBadgeManager.updateTotalBadge();
    }

    static updateRoomTitleBadge(client) {
        UnreadBadgeManager.updateRoomTitleBadge(client || this.client);
    }

    static getSyncStatus() {
        return UnreadBadgeManager.getSyncStatus();
    }

    static getLocalUnreadTotal() {
        return UnreadBadgeManager.getLocalUnreadTotal();
    }

    static updateMembersList(members) {
        MemberListRenderer.updateMembersList(members);
    }

    static updateMembersListWithStatus(onlineMembers, offlineMembers) {
        MemberListRenderer.updateMembersListWithStatus(onlineMembers, offlineMembers);
    }

    static syncVolumeSliders() {
        MemberListRenderer.syncVolumeSliders();
    }

    static showVolumeSliderByUserId(producerId, userId) {
        MemberListRenderer.showVolumeSliderByUserId(producerId, userId);
    }

    static updateMemberMicState(userId, isActive, source = 'client') {
        MemberListRenderer.updateMemberMicState(userId, isActive, source);
    }

    static openDiagnosticPanel(client) {
        DiagnosticPanel.open(client);
    }

    static closeDiagnosticPanel() {
        DiagnosticPanel.close();
    }

    static renderDiagnosticSnapshot(snapshot) {
        DiagnosticPanel.renderSnapshot(snapshot);
    }

    static getSecondaryChatDirection() {
        return SecondaryChatManager.getDirection();
    }

    static toggleSecondaryChat(client, direction = 'side') {
        return SecondaryChatManager.toggle(client, direction);
    }

    static openSecondaryChatDirect(client, roomId) {
        return SecondaryChatManager.openDirect(client, roomId);
    }

    static _joinSecondaryRoom(client, roomId) {
        return SecondaryChatManager.joinRoom(client, roomId);
    }

    static addSecondaryMessage(...args) {
        SecondaryChatManager.addMessage(...args);
    }

    static openCreateRoomModal(client, onSubmit) {
        ModalManager.openCreateRoomModal(client, onSubmit);
    }

    static openSettingsModal(client) {
        ModalManager.openSettingsModal(client);
    }

    static openModal(title, content, onSubmit) {
        ModalManager.openModal(title, content, onSubmit);
    }

    static closeModal() {
        ModalManager.closeModal();
    }

    static showError(message) {
        ModalManager.showError(message);
    }

    static showConnectionStatus(userId, status) {
        const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
        if (!memberElement) return;
        this.connectionStatusMap.set(userId, status);
        const ICONS = {
            unknown: '❓', connecting: '🔄', connected: '✅', success: '✅',
            error: '❌', info: 'ℹ️', disconnected: '🔴'
        };
        const COLORS = {
            unknown: '#606070', connecting: '#f1c40f', connected: '#2ecc71', success: '#2ecc71',
            error: '#e74c3c', info: '#3498db', disconnected: '#e74c3c'
        };
        const TITLES = {
            connecting: 'Подключение...', connected: 'Подключен', success: 'Подключен',
            error: 'Ошибка подключения', disconnected: 'Отключен', unknown: 'Неизвестно'
        };
        const icon = ICONS[status] || ICONS.unknown;
        const color = COLORS[status] || COLORS.unknown;
        const title = TITLES[status] || 'Неизвестно';
        let statusElement = memberElement.querySelector('.connection-status-icon');
        if (!statusElement) {
            statusElement = document.createElement('span');
            statusElement.className = 'connection-status-icon';
            statusElement.style.cssText = 'margin-left: 6px; font-size: 12px; cursor: help;';
            const memberName = memberElement.querySelector('.member-name');
            if (memberName) memberName.appendChild(statusElement);
        }
        statusElement.textContent = icon;
        statusElement.style.color = color;
        statusElement.title = title;
    }

    static getConnectionStatus(userId) {
        return this.connectionStatusMap.get(userId) || 'unknown';
    }

    static clearConnectionStatuses() {
        this.connectionStatusMap.clear();
        document.querySelectorAll('.connection-status-icon').forEach((el) => el.remove());
    }

    static updateStatus(text, status) {
        const statusText = document.querySelector('.status-text');
        const statusIndicator = document.querySelector('.status-indicator');
        if (statusText) statusText.textContent = text;
        if (statusIndicator) {
            statusIndicator.className = 'status-indicator';
            if (status === 'connecting') statusIndicator.classList.add('connecting');
            else if (status === 'disconnected') statusIndicator.classList.add('disconnected');
            else if (status === 'connected') statusIndicator.classList.add('connected');
        }
    }

    static updateMicButton(status) {
        const STATES = {
            disconnected: { class: 'disconnected', text: '🎤', title: 'Не подключен к голосовому каналу' },
            connecting: { class: 'connecting', text: '🎤', title: 'Подключение...' },
            connected: { class: 'connected', text: '🎤', title: 'Микрофон выключен (нажмите чтобы включить)' },
            active: { class: 'active', text: '🔴', title: 'Микрофон включен (нажмите чтобы выключить)' },
            paused: { class: 'paused', text: '⏸️', title: 'Микрофон на паузе (нажмите чтобы возобновить)' },
            error: { class: 'error', text: '🎤', title: 'Ошибка доступа к микрофону' }
        };
        const state = STATES[status] || STATES.disconnected;
        ['.mic-button', '.mic-toggle-btn'].forEach((sel) => {
            const element = document.querySelector(sel);
            if (element) {
                element.className = sel.replace('.', '') + ' ' + state.class;
                element.textContent = state.text;
                element.title = state.title;
            }
        });
    }

    static updateAudioStatus(activeConsumers) {
        const statusElement = document.querySelector('.audio-status');
        if (!statusElement) return;
        if (activeConsumers > 0) {
            statusElement.textContent = `Активных аудиопотоков: ${activeConsumers}`;
            statusElement.style.color = 'var(--success)';
        } else {
            statusElement.textContent = 'Нет активных аудиопотоков';
            statusElement.style.color = 'var(--text-muted)';
        }
    }

    static updateRoomTitle(title) {
        const titleElement = document.querySelector('.current-room-title');
        if (titleElement) titleElement.textContent = title;
    }

    static async updateRoomUI(client) {
        const c = client || this.client;
        if (!c) return;
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
            const sentinel = messagesContainer.querySelector('.history-sentinel');
            const children = Array.from(messagesContainer.children);
            for (const child of children) {
                if (child !== sentinel) messagesContainer.removeChild(child);
            }
            if (sentinel && messagesContainer.firstChild !== sentinel) messagesContainer.prepend(sentinel);
        }
        let roomTitle = 'Выберите гнездо';
        if (c.currentRoom) {
            const currentRoomData = c.rooms?.find((room) => room.id === c.currentRoom);
            if (currentRoomData) {
                const isPrivate = RoomManager.isPrivateRoom(c.currentRoom);
                roomTitle = isPrivate
                    ? `👤 ${await RoomManager.getPrivateRoomDisplayName(c.currentRoom, c.userId, c.currentServer) || currentRoomData.name}`
                    : `Гнездо: ${currentRoomData.name}`;
            } else {
                const isPrivate = RoomManager.isPrivateRoom(c.currentRoom);
                roomTitle = isPrivate
                    ? `👤 ${await RoomManager.getPrivateRoomDisplayName(c.currentRoom, c.userId, c.currentServer) || c.currentRoom}`
                    : `Гнездо: ${c.currentRoom}`;
            }
        }
        this.updateRoomTitle(roomTitle);
        if (c.isConnected) {
            if (c.isMicPaused) this.updateMicButton('paused');
            else if (c.isMicActive) this.updateMicButton('active');
            else this.updateMicButton('connected');
        } else {
            this.updateMicButton('disconnected');
        }
        this.updateRoomTitleBadge(c);
        this.updateTotalBadge();
    }

    static showLiveNotification(client, payload) {
        this.hideLiveNotification();
        const banner = document.createElement('div');
        banner.id = 'live-notification-banner';
        banner.style.cssText = 'position: sticky; top: 0; background: #2d2d44; border-bottom: 1px solid #404060; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; z-index: 1000; font-size: 13px; color: #e0e0e0;';
        const time = payload.timestamp ? new Date(payload.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
        banner.innerHTML = `<div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; margin-right: 10px;"><strong style="color: #5865f2;">${this.escapeHtml(payload.username)}</strong> <span style="opacity: 0.7;">(${this.escapeHtml(payload.roomName)})</span>: ${this.escapeHtml(payload.text)} <span style="opacity: 0.5; margin-left: 5px; font-size: 11px;">${time}</span></div><button id="notif-close" style="background: none; border: none; color: #e0e0e0; cursor: pointer; font-size: 16px; padding: 0 8px;">✕</button>`;
        const chatArea = document.querySelector('.primary-frame') || document.querySelector('.chat-area');
        if (chatArea) chatArea.prepend(banner);
        this.notificationTimer = setTimeout(() => this.hideLiveNotification(), 10000);
        banner.querySelector('#notif-close').addEventListener('click', (e) => { e.stopPropagation(); this.hideLiveNotification(); });
        banner.addEventListener('click', () => { this.hideLiveNotification(); if (client) client.openSecondaryFromNotification(payload.roomId); });
    }

    static hideLiveNotification() {
        clearTimeout(this.notificationTimer);
        this.notificationTimer = null;
        const banner = document.getElementById('live-notification-banner');
        if (banner) banner.remove();
    }

    static escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static async fetchUsername(userId) {
        if (!userId) return 'Unknown';
        if (this.usernameCache.has(userId)) return this.usernameCache.get(userId);
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/users/${userId}`, {
                headers: { Authorization: `Bearer ${this.client.token}`, 'Content-Type': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                const username = data.username || userId.replace('user_', '');
                this.usernameCache.set(userId, username);
                return username;
            }
        } catch (error) {
            console.error('Ошибка получения имени пользователя:', error);
        }
        const fallback = userId.replace('user_', '');
        this.usernameCache.set(userId, fallback);
        return fallback;
    }

static async fetchUsernames(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    
    const missing = userIds.filter((id) => !this.usernameCache.has(id));
    if (missing.length === 0) return;
    
    console.log(`[UIManager] Загружаем имена для ${missing.length} пользователей через одиночные запросы`);
    
    // Загружаем параллельно, но не более 5 одновременно
    const batchSize = 5;
    for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        await Promise.all(batch.map(uid => this.fetchUsername(uid)));
    }
}
}

export default UIManager;
