import TextChatManager from './TextChatManager.js';
import UIManager from './UIManager.js';

class SecondaryChatManager {
    static secondaryChat = {
        enabled: false,
        direction: 'side',
        roomId: null,
        container: null,
        messagesContainer: null,
        inputEl: null,
        roomSelector: null,
        roomList: null,
        isLoading: false,
        hasMore: true,
        oldestMessageId: null
    };
    static _splitPopup = null;

    static getDirection() {
        const frame = document.querySelector('.primary-frame') || document.querySelector('.chat-area');
        if (frame) {
            const rect = frame.getBoundingClientRect();
            return rect.width > rect.height ? 'side' : 'top';
        }
        return 'side';
    }

    static async toggle(client, direction = 'side') {
        this.secondaryChat.direction = direction;
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        this.secondaryChat.enabled = !this.secondaryChat.enabled;
        
        if (!client.secondaryChat) {
            client.secondaryChat = { enabled: false, roomId: null, isLoading: false, hasMore: true, oldestMessageId: null };
        }
        client.secondaryChat.enabled = this.secondaryChat.enabled;

        if (this.secondaryChat.enabled) {
            const chatArea = mainContent.querySelector('.chat-area');
            if (!chatArea) return;

            const splitContainer = document.createElement('div');
            splitContainer.className = `chat-split-container split-${direction}`;
            splitContainer.id = 'chat-split-container';

            const primaryFrame = document.createElement('div');
            primaryFrame.className = 'primary-frame';
            Array.from(chatArea.children).forEach((child) => primaryFrame.appendChild(child));

            const secondaryFrame = document.createElement('div');
            secondaryFrame.className = 'secondary-frame';
            secondaryFrame.innerHTML = `
                <div class="secondary-chat-header">
                    <select class="secondary-room-selector">
                        <option value="">📋 Выберите гнездо...</option>
                    </select>
                    <button class="secondary-close-btn" title="Закрыть">✕</button>
                </div>
                <div class="secondary-room-list">
                    <div class="no-results">Загрузка гнёзд...</div>
                </div>
                <div class="secondary-messages-container" style="display: none;"></div>
                <div class="secondary-input-area" style="display: none;">
                    <textarea class="message-input" placeholder="Написать сообщение..." rows="1"></textarea>
                    <button class="send-btn">➤</button>
                </div>
            `;

            splitContainer.appendChild(primaryFrame);
            splitContainer.appendChild(secondaryFrame);
            chatArea.appendChild(splitContainer);

            this.secondaryChat.container = secondaryFrame;
            this.secondaryChat.messagesContainer = secondaryFrame.querySelector('.secondary-messages-container');
            this.secondaryChat.inputEl = secondaryFrame.querySelector('.secondary-input-area .message-input');
            this.secondaryChat.roomSelector = secondaryFrame.querySelector('.secondary-room-selector');
            this.secondaryChat.roomList = secondaryFrame.querySelector('.secondary-room-list');

            this._initEvents(client);
            await this._loadRoomOptions(client);

            const splitBtn = document.querySelector('.split-toggle-btn');
            if (splitBtn) splitBtn.classList.add('active');
        } else {
            if (client.secondaryChat.roomId) client.secondaryChat.roomId = null;
            
            const splitContainer = document.getElementById('chat-split-container');
            if (splitContainer) {
                const primaryFrame = splitContainer.querySelector('.primary-frame');
                const parent = splitContainer.parentNode;
                if (primaryFrame) {
                    const children = Array.from(primaryFrame.children);
                    children.forEach((child) => parent.insertBefore(child, splitContainer));
                }
                splitContainer.remove();
            }

            this.secondaryChat = {
                enabled: false, direction: 'side', roomId: null,
                container: null, messagesContainer: null, inputEl: null,
                roomSelector: null, roomList: null,
                isLoading: false, hasMore: true, oldestMessageId: null
            };
            client.secondaryChat.enabled = false;
            client.secondaryChat.roomId = null;
            client.secondaryChat.isLoading = false;

            const splitBtn = document.querySelector('.split-toggle-btn');
            if (splitBtn) splitBtn.classList.remove('active');
        }
    }

    static _initEvents(client) {
        const { container, roomSelector, roomList, inputEl } = this.secondaryChat;
        if (!container) return;

        const closeBtn = container.querySelector('.secondary-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (client?.toggleSecondaryChat) client.toggleSecondaryChat();
            });
        }

        if (roomSelector) {
            roomSelector.addEventListener('change', async (e) => {
                const roomId = e.target.value;
                if (roomId && !this.secondaryChat.isLoading) {
                    await this.joinRoom(client, roomId);
                }
            });
        }

        if (roomList) {
            roomList.addEventListener('click', async (e) => {
                const item = e.target.closest('.secondary-room-item');
                if (item && item.dataset.roomId && !this.secondaryChat.isLoading) {
                    await this.joinRoom(client, item.dataset.roomId);
                }
            });
        }

        if (inputEl) {
            const sendBtn = container.querySelector('.secondary-input-area .send-btn');
            
            const handleSend = async () => {
                if (this.secondaryChat.isLoading || !this.secondaryChat.roomId) return;
                const text = inputEl.value.trim();
                if (text && client) {
                    const replyTarget = UIManager.getReplyTarget 
                        ? { id: UIManager.getReplyTarget().id, username: UIManager.getReplyTarget().username } 
                        : null;
                    await client.sendSecondaryMessage(text, this.secondaryChat.roomId, replyTarget);
                    inputEl.value = '';
                    inputEl.style.height = '36px';
                    if (replyTarget) UIManager.clearReplyTarget();
                }
            };

            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            });

            inputEl.addEventListener('input', (e) => {
                e.target.style.height = '36px';
                e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
            });

            if (sendBtn) sendBtn.addEventListener('click', handleSend);
        }
    }

    static async _loadRoomOptions(client) {
        const { roomSelector, roomList } = this.secondaryChat;
        if (!roomSelector || !roomList) return;

        roomList.innerHTML = '<div class="no-results">Загрузка...</div>';
        roomSelector.innerHTML = '<option value="">📋 Выберите гнездо...</option>';

        try {
            const servers = client.servers || [];
            let optionsHtml = '';
            let listHtml = '';

            for (const server of servers) {
                const isPrivateServer = server.type === 'private' || server.id?.startsWith('user_');
                const serverName = UIManager.escapeHtml(isPrivateServer ? `🌳 ${server.displayName || server.name || 'Приватный'}` : `🌳 ${server.name}`);
                
                optionsHtml += `<optgroup label="${serverName}">`;
                listHtml += `<div class="secondary-room-group" data-server-id="${server.id}"><div class="secondary-room-group-title">${serverName}</div>`;

                if (isPrivateServer) {
                    const roomId = server.id;
                    optionsHtml += `<option value="${roomId}">${serverName} <span class="room-type-badge">🔒</span></option>`;
                    listHtml += `<div class="secondary-room-item" data-room-id="${roomId}">${serverName} <span class="room-type-badge">🔒</span></div>`;
                } else {
                    const serverRooms = client.rooms?.filter((r) => r.serverId === server.id) || [];
                    for (const room of serverRooms) {
                        const roomId = room.id || '';
                        const roomName = UIManager.escapeHtml(room.name || room.id || 'Гнездо');
                        const isPrivateRoom = room.type === 'private' || roomId.startsWith('user_');
                        const badge = isPrivateRoom ? '<span class="room-type-badge">🔒</span>' : '';
                        optionsHtml += `<option value="${roomId}">${roomName}${badge}</option>`;
                        listHtml += `<div class="secondary-room-item" data-room-id="${roomId}">${roomName}${badge}</div>`;
                    }
                }

                optionsHtml += `</optgroup>`;
                listHtml += `</div>`;
            }

            roomSelector.innerHTML += optionsHtml;
            roomList.innerHTML = listHtml || '<div class="no-results">Нет доступных гнёзд</div>';
        } catch (error) {
            console.error('Ошибка загрузки комнат для второго чата:', error);
        }
    }

    static async joinRoom(client, roomId) {
        if (!client) return;
        const secChat = this.secondaryChat;
        if (secChat.isLoading) return;

        secChat.roomId = roomId;
        secChat.isLoading = true;
        secChat.hasMore = true;
        secChat.oldestMessageId = null;

        client.secondaryChat.roomId = roomId;
        client.secondaryChat.isLoading = true;
        client.secondaryChat.hasMore = true;

        if (client.socket?.connected) {
            client.socket.emit('secondary-chat-update', { roomId });
        }

        const { messagesContainer, roomList, roomSelector, inputEl } = secChat;
        if (roomList) roomList.style.display = 'none';
        if (messagesContainer) {
            messagesContainer.style.display = 'block';
            messagesContainer.innerHTML = '<div class="loading-state">⏳ Загрузка...</div>';
        }
        if (inputEl) {
            inputEl.parentElement.style.display = 'flex';
            inputEl.value = '';
        }

        if (roomList) {
            roomList.querySelectorAll('.secondary-room-item').forEach((item) => {
                item.classList.toggle('active', item.dataset.roomId === roomId);
            });
        }
        if (roomSelector) roomSelector.value = roomId;

        try {
            const result = await TextChatManager.loadMessages(client, roomId, 50, null, messagesContainer);
            if (result?.messages?.length > 0) {
                secChat.oldestMessageId = result.messages[0].id;
                secChat.hasMore = result.hasMore;
            } else {
                if (messagesContainer) messagesContainer.innerHTML = '<div class="empty-state">Нет сообщений</div>';
                secChat.hasMore = false;
            }

            let serverId = roomId;
            const isPrivate = roomId.startsWith('user_') && roomId.includes('_user_');
            if (!isPrivate) {
                const room = client.rooms?.find((r) => r.id === roomId);
                if (room?.serverId) serverId = room.serverId;
            }
            UIManager.clearUnreadForRoom(serverId, roomId);
        } catch (error) {
            if (messagesContainer) {
                messagesContainer.innerHTML = `<div class="error-message">Ошибка загрузки: ${error.message}</div>`;
            }
        } finally {
            secChat.isLoading = false;
            client.secondaryChat.isLoading = false;
        }
    }

    static addMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readState = 0, userId = null, broadcast = false, thumbnailUrl = null, replyTo = null) {
        if (!this.secondaryChat.enabled || !this.secondaryChat.messagesContainer) return;
        if (messageId && this.secondaryChat.messagesContainer.querySelector(`[data-message-id="${messageId}"]`)) return;

        if (this.secondaryChat.roomId) {
            let serverId = this.secondaryChat.roomId;
            const isPrivate = this.secondaryChat.roomId.startsWith('user_') && this.secondaryChat.roomId.includes('_user_');
            if (!isPrivate && window.voiceClient) {
                const room = window.voiceClient.rooms?.find((r) => r.id === this.secondaryChat.roomId);
                if (room?.serverId) serverId = room.serverId;
            }
            UIManager.clearUnreadForRoom(serverId, this.secondaryChat.roomId);
        }

        UIManager.addMessage(user, text, timestamp, type, imageUrl, messageId, readState, userId, broadcast, thumbnailUrl, this.secondaryChat.messagesContainer, replyTo);
    }

    static async openDirect(client, roomId) {
        if (!client || !roomId) return;
        if (this.secondaryChat.enabled && this.secondaryChat.roomId === roomId) return;
        if (!this.secondaryChat.enabled) await this.toggle(client, 'side');
        
        setTimeout(async () => {
            if (this.secondaryChat.enabled) await this.joinRoom(client, roomId);
        }, 200);
    }
}

export default SecondaryChatManager;
