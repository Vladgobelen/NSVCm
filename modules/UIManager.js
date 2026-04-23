'use strict';
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
import NoteStateManager from './NoteStateManager.js';
import NoteUIManager from './NoteUIManager.js';
import MobileOnlineBar from './MobileOnlineBar.js';
import AvatarManager from './AvatarManager.js';

window.ScrollTracker = ScrollTracker;

class UIManager {
    static client = null;
    static usernameCache = new Map();
    static connectionStatusMap = new Map();
    static notificationTimer = null;
    static _tooltipsInitialized = false;

    static get secondaryChat() { return SecondaryChatManager.secondaryChat; }
    static get replyTarget() { return ReplyManager.getReplyTarget(); }
    static set replyTarget(val) { val ? ReplyManager.setReplyTarget(val) : ReplyManager.clearReplyTarget(); }

    static setClient(client) {
        this.client = client;
        ScrollTracker.setClient(client);
        MessageRenderer.setClient(client);
        UnreadBadgeManager.setClient(client);
        AvatarManager.init(client);
        MobileOnlineBar.init();
        this._initReactionTooltips();
    }

    static initDesktopSwipe() {
        return;
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
            const missingIds = ids.filter(uid => !this.usernameCache.has(uid));
            if (missingIds.length > 0) {
                tooltip.textContent = 'Загрузка...';
                tooltip.style.display = 'block';
                const rect = pill.getBoundingClientRect();
                tooltip.style.left = `${rect.left}px`;
                tooltip.style.top = `${rect.top - 35}px`;
                await this.fetchUsernames(missingIds);
            }
            const names = ids.map(uid => this.usernameCache.get(uid) || 'Пользователь').join(', ');
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

    static setupScrollToBottomButton() { ScrollTracker.setupScrollToBottomButton(); }
    static _checkScrollVisibility(container) { ScrollTracker._checkScrollVisibility(container); }
    static scrollToBottom(container = null) { ScrollTracker.scrollToBottom(container); }
    static scrollToMessage(messageId, container = null, highlight = true) {
        const target = container || document.querySelector('.messages-container');
        if (!target) return false;
        if (!messageId) { ScrollTracker.scrollToBottom(target); return false; }
        const found = ScrollTracker.scrollToMessage(messageId, target, highlight);
        if (!found) this._findAndScrollToClosestMessage(messageId, target);
        return found;
    }

    static async _findAndScrollToClosestMessage(targetId, container) {
        const client = this.client || window.voiceClient;
        const roomId = client?.currentRoom;
        if (!roomId || !client) return;
        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages/${roomId}/messages/closest?targetId=${targetId}&direction=newer`, { headers: { Authorization: `Bearer ${client.token}` } });
            if (!response.ok) return;
            const data = await response.json();
            if (data.closestId) {
                TextChatManager.loadMessagesAround(client, roomId, data.closestId, 50).then(() => {
                    setTimeout(() => ScrollTracker.scrollToMessage(data.closestId, container, true), 300);
                }).catch(() => {});
            } else {
                ScrollTracker.scrollToBottom(container);
            }
        } catch (error) {}
    }

    static initScrollTracker(roomId, container = null) { ScrollTracker.initScrollTracker(roomId, container); }
    static saveLastViewedMessage(roomId, container = null) { ScrollTracker.saveLastViewedMessage(roomId, container); }
    static getLastViewedMessage(roomId) { return ScrollTracker.getLastViewedMessage(roomId); }
    static getMaxSeenMessageId(roomId) { return ScrollTracker.getMaxSeenMessageId(roomId); }
    static getFirstUnreadId(roomId) { return ScrollTracker.getFirstUnreadId(roomId); }
    static setMaxSeenMessageId(roomId, messageId) { ScrollTracker.setMaxSeenMessageId(roomId, messageId); }
    static setFirstUnreadId(roomId, messageId) { ScrollTracker.setFirstUnreadId(roomId, messageId); }
    static clearLastViewedMessage(roomId) { ScrollTracker.clearLastViewedMessage(roomId); }
    static refreshUnreadScan(roomId) { ScrollTracker.refreshUnreadScan(roomId); }

    static updateScrollButtonCounter(roomId) {
        const unreadData = UnreadBadgeManager.getRoomUnreadData(roomId);
        if (!unreadData) return;
        const btn = document.getElementById('scroll-to-bottom-btn');
        if (!btn) return;
        const existingCounter = btn.querySelector('.scroll-btn-counter');
        if (existingCounter) existingCounter.remove();
        const total = unreadData.count || 0;
        const personal = unreadData.personalCount || 0;
        if (total > 0) {
            const counter = document.createElement('span');
            counter.className = 'scroll-btn-counter';
            counter.style.cssText = 'position: absolute; top: -8px; right: -8px; background: #ed4245; color: white; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 10px; min-width: 18px; text-align: center; line-height: 1.2; border: 1px solid #2d2d44;';
            counter.textContent = personal > 0 ? `${total}@${personal}` : `${total}`;
            btn.style.position = 'relative';
            btn.appendChild(counter);
        }
    }

    static setReplyTarget(msg) { ReplyManager.setReplyTarget(msg); }
    static clearReplyTarget() { ReplyManager.clearReplyTarget(); }
    static getReplyTarget() { return ReplyManager.getReplyTarget(); }
    static showMessageContextMenu(event, messageId, userId, username, timestamp, messageObj = null) { ContextMenuManager.showMessageContextMenu(event, messageId, userId, username, timestamp, messageObj); }
    static showMemberContextMenu(event, userId, username) { ContextMenuManager.showMemberContextMenu(event, userId, username); }
    static hideContextMenu() { ContextMenuManager.hideContextMenu(); }

    static addMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null, broadcast = false, thumbnailUrl = null, targetContainer = null, replyTo = null, reactions = {}, poll = null, forwardedFrom = null, pollRef = null, embed = null, edited = false, editedAt = null) {
        return MessageRenderer.addMessage(user, text, timestamp, type, imageUrl, messageId, readBy, userId, broadcast, thumbnailUrl, targetContainer, replyTo, reactions, poll, forwardedFrom, pollRef, embed, edited, editedAt);
    }
    static prependMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readState = 0, userId = null, broadcast = false, thumbnailUrl = null, replyTo = null, reactions = {}, poll = null, forwardedFrom = null, pollRef = null, embed = null, edited = false, editedAt = null) {
        return MessageRenderer.prependMessage(user, text, timestamp, type, imageUrl, messageId, readState, userId, broadcast, thumbnailUrl, replyTo, reactions, poll, forwardedFrom, pollRef, embed, edited, editedAt);
    }
    static prependMessageToContainer(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readState = 0, userId = null, broadcast = false, thumbnailUrl = null, container = null, replyTo = null) {
        return MessageRenderer.prependMessage(user, text, timestamp, type, imageUrl, messageId, readState, userId, broadcast, thumbnailUrl, replyTo, {}, null, null);
    }
    static prependMessagesBatch(messages) { MessageRenderer.prependMessagesBatch(messages); }
    static clearContainerMessages(container = null) { MessageRenderer.clearContainerMessages(container); }
    static openImageModal(imageUrl) { MessageRenderer.openImageModal(imageUrl); }
    static updateMessageReadStatus(messageId, readData) { MessageRenderer.updateMessageReadStatus(messageId, readData); }
    static updateMessageReactions(messageId, reactions) { MessageRenderer.updateMessageReactions(messageId, reactions); }
    static toggleReaction(messageId, emoji) {
        if (this.client && typeof this.client.toggleReaction === 'function') this.client.toggleReaction(messageId, emoji);
    }
    static removeMessageFromUI(messageId) { MessageRenderer.removeMessageFromUI(messageId); }
    static highlightCodeBlocks(container = null) { return MessageRenderer.highlightCodeBlocks(container); }
    static handleReplyClick(messageId) { return MessageRenderer.handleReplyClick(messageId); }

    static async showMessageInfo(messageId, userId, username, timestamp) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/messages/${this.client.currentRoom}/${messageId}/info`, { headers: { Authorization: `Bearer ${this.client.token}`, 'Content-Type': 'application/json' } });
            if (!response.ok) throw new Error('Не удалось получить информацию');
            const data = await response.json();
            const message = data.message;
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';
            const content = document.createElement('div');
            content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; border: 1px solid #404060;';
            let forwardedInfo = '';
            if (message.forwardedFrom) {
                forwardedInfo = `<div style="margin-top: 12px;"><strong>Переслано из:</strong> ${this.escapeHtml(message.forwardedFrom.serverName)} / ${this.escapeHtml(message.forwardedFrom.roomName)}</div><div style="margin-top: 4px;"><strong>Автор оригинала:</strong> ${this.escapeHtml(message.forwardedFrom.username)}</div>`;
            }
            let pollInfo = '';
            if (message.type === 'poll' && message.poll) {
                pollInfo = `<div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px;"><strong>📊 Опрос:</strong> ${this.escapeHtml(message.poll.question)}<br><span style="font-size: 12px; color: #888;">Вариантов: ${message.poll.options.length} | Голосов: ${message.poll.totalVotes}</span></div>`;
            }
            content.innerHTML = `<h3 style="margin: 0 0 20px 0; color: #e0e0e0;">📋 Информация о сообщении</h3><div style="color: #b0b0c0; line-height: 1.8;"><div><strong>ID:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.id}</code></div><div style="margin-top: 12px;"><strong>Автор:</strong> ${this.escapeHtml(message.username)}</div><div style="margin-top: 8px;"><strong>ID автора:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.userId}</code></div><div style="margin-top: 8px;"><strong>Время:</strong> ${new Date(message.timestamp).toLocaleString('ru-RU')}</div><div style="margin-top: 8px;"><strong>Тип:</strong> ${message.type || 'text'}</div><div style="margin-top: 8px;"><strong>Гнездо:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.roomId}</code></div>${forwardedInfo}${pollInfo}${message.text ? `<div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px;"><strong>Текст:</strong><br><span style="color: #e0e0e0;">${this.escapeHtml(message.text)}</span></div>` : ''}</div><button id="closeInfoModal" style="margin-top: 20px; padding: 10px 24px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Закрыть</button>`;
            modal.appendChild(content);
            document.body.appendChild(modal);
            const closeBtn = content.querySelector('#closeInfoModal');
            closeBtn.addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        } catch (error) {
            this.showError('Не удалось получить информацию о сообщении');
        }
    }

    static async confirmDeleteMessage(messageId) {
        const confirmed = confirm('Вы уверены, что хотите удалить это сообщение? Это действие нельзя отменить.');
        if (!confirmed) return;
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/messages/${this.client.currentRoom}/${messageId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${this.client.token}`, 'Content-Type': 'application/json' } });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Не удалось удалить сообщение');
            }
        } catch (error) {
            this.showError('Не удалось удалить сообщение: ' + error.message);
        }
    }

    static showReplyInfoModal(message) { MessageRenderer.showReplyInfoModal(message); }
    static syncUnreadCounts(serverData) { UnreadBadgeManager.syncUnreadCounts(serverData); }
    static setUnreadCount(serverId, roomId, count, hasMention, personalCount = 0) { UnreadBadgeManager.setUnreadCount(serverId, roomId, count, hasMention, personalCount); }
    static clearUnreadForServer(serverId) { UnreadBadgeManager.clearUnreadForServer(serverId); }
    static clearUnreadForRoom(serverId, roomId) { UnreadBadgeManager.clearUnreadForRoom(serverId, roomId); }
    static clearAllUnread() { UnreadBadgeManager.clearAllUnread(); }
    static updateServerBadges() { UnreadBadgeManager.updateServerBadges(); }
    static updateRoomBadges() { UnreadBadgeManager.updateRoomBadges(); }
    static updateTotalBadge() { UnreadBadgeManager.updateTotalBadge(); }
    static updateRoomTitleBadge(client) { UnreadBadgeManager.updateRoomTitleBadge(client || this.client); }
    static getSyncStatus() { return UnreadBadgeManager.getSyncStatus(); }
    static getLocalUnreadTotal() { return UnreadBadgeManager.getLocalUnreadTotal(); }

    static updateMembersList(members) { MemberListRenderer.updateMembersList(members); }
    
    static updateMembersListWithStatus(onlineMembers, offlineMembers) {
        if (AvatarManager) {
            const allMembers = [...(onlineMembers || []), ...(offlineMembers || [])];
            AvatarManager.fetchUsers(allMembers.map(m => m.userId)).catch(() => {});
            MobileOnlineBar.update(onlineMembers);
        }
        MemberListRenderer.updateMembersListWithStatus(onlineMembers, offlineMembers);
    }

    static syncVolumeSliders() { MemberListRenderer.syncVolumeSliders(); }
    static showVolumeSliderByUserId(producerId, userId) { MemberListRenderer.showVolumeSliderByUserId(producerId, userId); }
    static updateMemberMicState(userId, isActive, source = 'client') { MemberListRenderer.updateMemberMicState(userId, isActive, source); }

    static openDiagnosticPanel(client) { DiagnosticPanel.open(client); }
    static closeDiagnosticPanel() { DiagnosticPanel.close(); }
    static renderDiagnosticSnapshot(snapshot) { DiagnosticPanel.renderSnapshot(snapshot); }

    static getSecondaryChatDirection() { return SecondaryChatManager.getDirection(); }
    static toggleSecondaryChat(client, direction = 'side') { return SecondaryChatManager.toggle(client, direction); }
    static openSecondaryChatDirect(client, roomId) { return SecondaryChatManager.openDirect(client, roomId); }
    static _joinSecondaryRoom(client, roomId) { return SecondaryChatManager.joinRoom(client, roomId); }
    static addSecondaryMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readState = 0, userId = null, broadcast = false, thumbnailUrl = null, replyTo = null) { SecondaryChatManager.addMessage(user, text, timestamp, type, imageUrl, messageId, readState, userId, broadcast, thumbnailUrl, replyTo); }

    static openCreateRoomModal(client, onSubmit) { ModalManager.openCreateRoomModal(client, onSubmit); }
    static openSettingsModal(client) { ModalManager.openSettingsModal(client); }
    static openModal(title, content, onSubmit) { ModalManager.openModal(title, content, onSubmit); }
    static closeModal() { ModalManager.closeModal(); }
    static showError(message) { ModalManager.showError(message); }

    static showConnectionStatus(userId, status) {
        const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
        if (!memberElement) return;
        this.connectionStatusMap.set(userId, status);
        const ICONS = { unknown: '❓', connecting: '🔄', connected: '✅', success: '✅', error: '❌', info: 'ℹ️', disconnected: '🔴' };
        const COLORS = { unknown: '#606070', connecting: '#f1c40f', connected: '#2ecc71', success: '#2ecc71', error: '#e74c3c', info: '#3498db', disconnected: '#e74c3c' };
        const icon = ICONS[status] || ICONS.unknown;
        const color = COLORS[status] || COLORS.unknown;
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
    }

    static getConnectionStatus(userId) { return this.connectionStatusMap.get(userId) || 'unknown'; }
    static clearConnectionStatuses() {
        this.connectionStatusMap.clear();
        document.querySelectorAll('.connection-status-icon').forEach(el => el.remove());
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

    static showNotification(message, type = 'info', duration = 3000) {
        const existingNotification = document.querySelector('.mic-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = `mic-notification mic-notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#ed4245' : type === 'success' ? '#2ecc71' : '#5865f2'};
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideUp 0.3s ease;
            white-space: nowrap;
        `;
        notification.textContent = message;
        
        if (!document.getElementById('mic-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'mic-notification-styles';
            style.textContent = `
                @keyframes slideUp {
                    from { opacity: 0; transform: translate(-50%, 20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                @keyframes slideDown {
                    from { opacity: 1; transform: translate(-50%, 0); }
                    to { opacity: 0; transform: translate(-50%, 20px); }
                }
                .mic-notification.fade-out {
                    animation: slideDown 0.3s ease forwards;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        if (duration > 0) {
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }
        
        return notification;
    }

    static updateMessageAvatarsForUser(userId) {
        MessageRenderer._updateMessageAvatarsForUser(userId);
    }

    static updateMicButton(status) {
        const STATES = {
            disconnected: { class: 'disconnected', text: '🎤', title: 'Не подключен к голосовому каналу' },
            connecting: { class: 'connecting', text: '🎤', title: 'Подключение микрофона...' },
            connected: { class: 'connected', text: '🎤', title: 'Микрофон выключен (нажмите чтобы включить)' },
            active: { class: 'active', text: '🔴', title: 'Микрофон включен (нажмите чтобы выключить)' },
            paused: { class: 'paused', text: '⏸️', title: 'Микрофон на паузе (нажмите чтобы включить)' },
            error: { class: 'error', text: '❌', title: 'Ошибка доступа к микрофону' }
        };
        
        const state = STATES[status] || STATES.disconnected;
        
        ['.mic-button', '.mic-toggle-btn'].forEach(sel => {
            const element = document.querySelector(sel);
            if (element) {
                element.classList.remove('disconnected', 'connecting', 'connected', 'active', 'paused', 'error');
                element.classList.add(state.class);
                element.textContent = state.text;
                element.title = state.title;
                
                if (status === 'connecting') {
                    element.style.opacity = '0.7';
                    element.style.cursor = 'wait';
                } else {
                    element.style.opacity = '';
                    element.style.cursor = '';
                    element.style.pointerEvents = '';
                }
            }
        });
    }

    static updateAudioStatus(activeConsumers) {
        const statusElement = document.querySelector('.audio-status');
        if (!statusElement) return;
        statusElement.textContent = activeConsumers > 0 ? `Активных аудиопотоков: ${activeConsumers}` : 'Нет активных аудиопотоков';
        statusElement.style.color = activeConsumers > 0 ? 'var(--success)' : 'var(--text-muted)';
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
            for (const child of children) if (child !== sentinel) messagesContainer.removeChild(child);
            if (sentinel && messagesContainer.firstChild !== sentinel) messagesContainer.prepend(sentinel);
        }
        
        const notesView = document.getElementById('notes-view-container');
        const threadView = document.getElementById('note-thread-container');
        
        if (notesView) {
            notesView.style.display = 'none';
        }
        if (threadView) {
            threadView.style.display = 'none';
        }
        
        let roomTitle = 'Выберите гнездо';
        if (c.currentRoom) {
            const currentRoomData = c.rooms?.find(room => room.id === c.currentRoom);
            if (currentRoomData) {
                const isPrivate = RoomManager.isPrivateRoom(c.currentRoom);
                if (isPrivate) {
                    const displayName = await RoomManager.getPrivateRoomDisplayName(c.currentRoom, c.userId, c.currentServer);
                    roomTitle = `👤 ${displayName || currentRoomData.name}`;
                } else {
                    roomTitle = `Гнездо: ${currentRoomData.name}`;
                }
            } else {
                const isPrivate = RoomManager.isPrivateRoom(c.currentRoom);
                if (isPrivate) {
                    const displayName = await RoomManager.getPrivateRoomDisplayName(c.currentRoom, c.userId, c.currentServer);
                    roomTitle = `👤 ${displayName || c.currentRoom}`;
                } else {
                    roomTitle = `Гнездо: ${c.currentRoom}`;
                }
            }
        }
        this.updateRoomTitle(roomTitle);
        
if (c.isConnected) {
    if (!c.audioProducer || c.audioProducer.closed) {
        this.updateMicButton('connected');
    } else if (c.isMicPaused) {
        this.updateMicButton('paused');
    } else if (c.isMicActive) {
        this.updateMicButton('active');
    } else {
        this.updateMicButton('connected');
    }
} else {
    this.updateMicButton('disconnected');
}
        
        this.updateRoomTitleBadge(c);
        this.updateTotalBadge();
        
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.classList.remove('open');
            }
        }
    }

    static showLiveNotification(client, payload) {
        this.hideLiveNotification();
        window.postMessage({ type: 'ELECTRON_SHOW_NOTIFICATION', title: payload.sender, body: payload.roomName || 'Новое сообщение', source: 'webview' }, '*');
        const banner = document.createElement('div');
        banner.id = 'live-notification-banner';
        banner.style.cssText = 'position: sticky; top: 0; background: #2d2d44; border-bottom: 1px solid #404060; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; z-index: 1000; font-size: 13px; color: #e0e0e0;';
        const time = payload.timestamp ? new Date(payload.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
        let icon = '📨';
        let actionText = '';
        let senderColor = '#e0e0e0';
        if (payload.type === 'mention' || payload.type === 'name_mention') {
            icon = '🔔'; actionText = 'упомянул вас'; senderColor = '#faa61a';
        } else if (payload.type === 'reply') {
            icon = '↩️'; actionText = 'ответил на ваше сообщение'; senderColor = '#00b0f4';
        } else if (payload.isDirectMessage) {
            icon = '💬'; actionText = 'прислал личное сообщение'; senderColor = '#2ecc71';
        } else {
            icon = '📨'; actionText = 'написал';
        }
        const roomDisplayName = payload.roomName || 'чат';
        banner.innerHTML = `<div style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; margin-right: 10px;">${icon} <strong style="color: ${senderColor};">${this.escapeHtml(payload.sender)}</strong><span style="opacity: 0.8;">${actionText} в <strong>${this.escapeHtml(roomDisplayName)}</strong></span><span style="opacity: 0.5; margin-left: 8px; font-size: 11px;">${time}</span></div><button id="notif-close" style="background: none; border: none; color: #e0e0e0; cursor: pointer; font-size: 16px; padding: 0 8px;">✕</button>`;
        const chatArea = document.querySelector('.primary-frame') || document.querySelector('.chat-area');
        if (chatArea) chatArea.prepend(banner);
        this.notificationTimer = setTimeout(() => this.hideLiveNotification(), 10000);
        banner.querySelector('#notif-close').addEventListener('click', e => { e.stopPropagation(); this.hideLiveNotification(); });
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
        if (!userId) return 'Пользователь';
        if (this.usernameCache.has(userId)) return this.usernameCache.get(userId);
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/users/${userId}`, { headers: { Authorization: `Bearer ${this.client.token}`, 'Content-Type': 'application/json' } });
            if (response.ok) {
                const data = await response.json();
                const username = data.username || 'Пользователь';
                this.usernameCache.set(userId, username);
                return username;
            }
        } catch (error) {}
        const fallback = 'Пользователь';
        this.usernameCache.set(userId, fallback);
        return fallback;
    }

    static async fetchUsernames(userIds) {
        if (!Array.isArray(userIds) || userIds.length === 0) return;
        const missing = userIds.filter(id => !this.usernameCache.has(id));
        if (missing.length === 0) return;
        const batchSize = 5;
        for (let i = 0; i < missing.length; i += batchSize) await Promise.all(missing.slice(i, i + batchSize).map(uid => this.fetchUsername(uid)));
    }

    static renderPinnedMessagesBar(client) {
        if (!client || !client.currentRoom) return;
        const roomId = client.currentRoom;
        const pinned = client.pinnedMessages.get(roomId) || [];
        
        let bar = document.getElementById('pinned-messages-bar');
        const messagesContainer = document.querySelector('.messages-container');
        
        const wasVisible = bar && bar.style.display === 'flex';
        const oldScrollTop = messagesContainer ? messagesContainer.scrollTop : 0;
        const oldBarHeight = wasVisible ? bar.offsetHeight : 0;
        
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'pinned-messages-bar';
            bar.className = 'pinned-messages-bar';
            const chatArea = document.querySelector('.chat-area');
            if (chatArea && messagesContainer) {
                chatArea.insertBefore(bar, messagesContainer);
            } else return;
        }
        
        if (pinned.length === 0) { 
            if (wasVisible) {
                bar.style.display = 'none';
                bar.innerHTML = '';
                if (messagesContainer) {
                    messagesContainer.scrollTop = Math.max(0, oldScrollTop - oldBarHeight);
                }
            } else {
                bar.style.display = 'none';
                bar.innerHTML = '';
            }
            return; 
        }
        
        const currentMessage = client.getCurrentPinnedMessage(roomId);
        if (!currentMessage) { 
            if (wasVisible) {
                bar.style.display = 'none';
                bar.innerHTML = '';
                if (messagesContainer) {
                    messagesContainer.scrollTop = Math.max(0, oldScrollTop - oldBarHeight);
                }
            } else {
                bar.style.display = 'none';
                bar.innerHTML = '';
            }
            return; 
        }
        
        const displayText = currentMessage.text && currentMessage.text.length > 50 
            ? currentMessage.text.substring(0, 50) + '...' 
            : (currentMessage.text || 'Изображение');
        
        bar.style.display = 'flex';
        bar.innerHTML = `
            <div class="pinned-message-content">
                <span class="pinned-icon">📌</span>
                <span class="pinned-author">${this.escapeHtml(currentMessage.username)}:</span>
                <span class="pinned-text">${this.escapeHtml(displayText)}</span>
            </div>
            <div class="pinned-actions">
                <span class="pinned-counter">${pinned.length}</span>
                <button class="pinned-expand-btn" title="Показать все закрепленные">📋</button>
                <button class="pinned-close-btn" title="Скрыть" style="display: none;">✕</button>
            </div>
        `;
        
        if (!wasVisible && messagesContainer) {
            requestAnimationFrame(() => {
                const newBarHeight = bar.offsetHeight;
                messagesContainer.scrollTop = oldScrollTop + newBarHeight;
            });
        } else if (wasVisible && messagesContainer) {
            requestAnimationFrame(() => {
                const newBarHeight = bar.offsetHeight;
                const heightDelta = newBarHeight - oldBarHeight;
                if (heightDelta !== 0) {
                    messagesContainer.scrollTop = oldScrollTop + heightDelta;
                }
            });
        }
        
        bar.querySelector('.pinned-message-content').addEventListener('click', () => { 
            if (client && typeof client.scrollToNextPinnedMessage === 'function') {
                client.scrollToNextPinnedMessage();
            }
        });
        
        bar.querySelector('.pinned-expand-btn').addEventListener('click', e => { 
            e.stopPropagation(); 
            this.openPinnedMessagesModal(client); 
        });
    }

    static hidePinnedMessagesBar() {
        const bar = document.getElementById('pinned-messages-bar');
        const messagesContainer = document.querySelector('.messages-container');
        
        if (bar) {
            const wasVisible = bar.style.display === 'flex';
            const barHeight = bar.offsetHeight;
            const oldScrollTop = messagesContainer ? messagesContainer.scrollTop : 0;
            
            bar.style.display = 'none';
            bar.innerHTML = '';
            
            if (wasVisible && messagesContainer) {
                messagesContainer.scrollTop = Math.max(0, oldScrollTop - barHeight);
            }
        }
    }

    static _fixViewportHeight() {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (window.mobileFix && typeof window.mobileFix.setVH === 'function') {
                    window.mobileFix.setVH();
                }
                
                const container = document.querySelector('.messages-container');
                const app = document.querySelector('.app');
                
                if (container && app) {
                    const scrollRatio = container.scrollTop / (container.scrollHeight - container.clientHeight) || 0;
                    
                    setTimeout(() => {
                        const newMaxScroll = container.scrollHeight - container.clientHeight;
                        container.scrollTop = newMaxScroll * scrollRatio;
                    }, 50);
                }
            });
        });
    }

    static openPinnedMessagesModal(client) {
        if (!client || !client.currentRoom) return;
        const roomId = client.currentRoom;
        const pinned = client.pinnedMessages.get(roomId) || [];
        const room = client.rooms?.find(r => r.id === roomId);
        const roomName = room ? room.name : 'Гнездо';
        const canManage = room && (room.ownerId === client.userId || (client.currentServer && client.currentServer.ownerId === client.userId));
        const existingModal = document.querySelector('.pinned-messages-modal');
        if (existingModal) existingModal.remove();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay pinned-messages-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10002;';
        const content = document.createElement('div');
        content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 0; max-width: 600px; width: 90%; max-height: 80vh; border: 1px solid #404060; display: flex; flex-direction: column; overflow: hidden;';
        let itemsHtml = '';
        if (pinned.length === 0) {
            itemsHtml = '<div class="pinned-empty" style="padding: 40px; text-align: center; color: #888;">Нет закрепленных сообщений</div>';
        } else {
            pinned.forEach((msg, index) => {
                const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
                const pinnedBy = msg.pinnedBy ? msg.pinnedBy.replace('user_', '').substring(0, 8) : '';
                const pinnedTime = msg.pinnedAt ? new Date(msg.pinnedAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                itemsHtml += `<div class="pinned-message-item" data-message-id="${msg.id}" data-index="${index}"><div class="pinned-item-header"><span class="pinned-item-author">${this.escapeHtml(msg.username)}</span><span class="pinned-item-time">${time}</span></div><div class="pinned-item-text">${this.escapeHtml(msg.text || '[Изображение]')}</div><div class="pinned-item-meta"><span>📌 закрепил ${pinnedBy} в ${pinnedTime}</span>${canManage ? `<button class="pinned-item-unpin" data-message-id="${msg.id}" title="Открепить">✕</button>` : ''}</div></div>`;
            });
        }
        content.innerHTML = `<div class="pinned-modal-header" style="padding: 16px 20px; border-bottom: 1px solid #404060; display: flex; justify-content: space-between; align-items: center;"><h3 style="margin: 0; color: #e0e0e0; font-size: 16px;">📌 Закрепленные сообщения — ${this.escapeHtml(roomName)}</h3><button class="pinned-modal-close" style="background: none; border: none; color: #888; font-size: 20px; cursor: pointer; padding: 4px 8px;">✕</button></div><div class="pinned-modal-body" style="padding: 16px 20px; overflow-y: auto; flex: 1;">${itemsHtml}</div>`;
        modal.appendChild(content);
        document.body.appendChild(modal);
        const closeBtn = content.querySelector('.pinned-modal-close');
        closeBtn.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        content.querySelectorAll('.pinned-message-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.closest('.pinned-item-unpin')) return;
                const messageId = item.dataset.messageId;
                modal.remove();
                UIManager.scrollToMessage(messageId, null, true);
            });
        });
        if (canManage) {
            content.querySelectorAll('.pinned-item-unpin').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const messageId = btn.dataset.messageId;
                    if (client && typeof client.unpinMessage === 'function') client.unpinMessage(roomId, messageId);
                    btn.closest('.pinned-message-item')?.remove();
                    if (content.querySelectorAll('.pinned-message-item').length === 0) {
                        const body = content.querySelector('.pinned-modal-body');
                        if (body) body.innerHTML = '<div class="pinned-empty" style="padding: 40px; text-align: center; color: #888;">Нет закрепленных сообщений</div>';
                    }
                });
            });
        }
    }

    static switchToNotesView(mode, targetId) {
        NoteUIManager.switchView(mode, targetId);
        this._updateNotesHeader(mode, targetId);
        this._togglePanelsForNotes(true);
    }

    static returnToChatView() {
        NoteUIManager.returnToChat();
        this._togglePanelsForNotes(false);
        if (this.client?.currentRoom) this.updateRoomTitle(`Гнездо: ${this.client.rooms?.find(r => r.id === this.client.currentRoom)?.name || this.client.currentRoom}`);
    }

    static _updateNotesHeader(mode, targetId) {
        const titleEl = document.querySelector('.current-room-title');
        if (!titleEl) return;
        if (mode === 'personal') titleEl.textContent = '🔐 Личные заметки';
        else if (mode === 'public') {
            const username = this.usernameCache.get(targetId) || targetId?.replace('user_', '').substring(0, 8) || 'Пользователь';
            titleEl.textContent = `🌐 Заметки ${username}`;
        } else if (mode === 'thread') titleEl.textContent = '💬 Тред заметки';
    }

    static _togglePanelsForNotes(isNotesView) {
        const chatArea = document.querySelector('.chat-area');
        const chatHeader = document.querySelector('.chat-header');
        const messagesContainer = document.querySelector('.messages-container');
        const notesViewContainer = document.getElementById('notes-view-container');
        const noteThreadContainer = document.getElementById('note-thread-container');
        const inputArea = document.querySelector('.input-area');
        const membersPanel = document.querySelector('.members-panel');
        const notesListPanel = membersPanel?.querySelector('.notes-list-panel');
        if (chatArea) chatArea.style.display = 'flex';
        if (chatHeader) chatHeader.style.display = 'flex';
        if (isNotesView) {
            if (messagesContainer) messagesContainer.style.display = 'none';
            if (inputArea) inputArea.style.display = 'none';
            if (membersPanel) membersPanel.style.display = 'none';
            if (notesListPanel) notesListPanel.style.display = 'block';
            if (notesViewContainer) { notesViewContainer.style.display = 'flex'; notesViewContainer.style.flex = '1'; }
            if (noteThreadContainer) noteThreadContainer.style.display = 'none';
        } else {
            if (messagesContainer) messagesContainer.style.display = 'block';
            if (inputArea) inputArea.style.display = 'flex';
            if (membersPanel) membersPanel.style.display = 'flex';
            if (notesListPanel) notesListPanel.style.display = 'none';
            if (notesViewContainer) notesViewContainer.style.display = 'none';
            if (noteThreadContainer) noteThreadContainer.style.display = 'none';
        }
    }

    static openUserPublicNotes(userId) {
        if (!userId) return;
        this.switchToNotesView('public', userId);
    }

    static openNoteThread(noteId, roomId) {
        if (!noteId || !roomId) return;
        NoteUIManager.openNoteThread(noteId, roomId);
        const notesViewContainer = document.getElementById('notes-view-container');
        const noteThreadContainer = document.getElementById('note-thread-container');
        if (notesViewContainer) notesViewContainer.style.display = 'none';
        if (noteThreadContainer) noteThreadContainer.style.display = 'flex';
    }

    static updateNotesListPanel(notes) {
        const notesListPanel = document.querySelector('.notes-list-panel .notes-list-content');
        if (!notesListPanel) return;
        NoteUIManager.renderNotesList(notesListPanel, notes);
    }

    static updateThreadMessages(messages) {
        const threadContainer = document.getElementById('note-thread-container');
        if (!threadContainer) return;
        const messagesEl = threadContainer.querySelector('.note-thread-messages');
        if (messagesEl) NoteUIManager.renderThreadMessages(messagesEl, messages);
    }

    static showNotesLoading(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const loadingEl = container.querySelector('.notes-loading');
        if (loadingEl) loadingEl.style.display = 'block';
    }

    static hideNotesLoading(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const loadingEl = container.querySelector('.notes-loading');
        if (loadingEl) loadingEl.style.display = 'none';
    }

    static showNotesEmpty(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const emptyEl = container.querySelector('.notes-empty');
        if (emptyEl) emptyEl.style.display = 'block';
    }

    static hideNotesEmpty(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const emptyEl = container.querySelector('.notes-empty');
        if (emptyEl) emptyEl.style.display = 'none';
    }
}

export default UIManager;
