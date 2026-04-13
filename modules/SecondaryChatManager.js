// modules/SecondaryChatManager.js
import TextChatManager from './TextChatManager.js';
import UIManager from './UIManager.js';
import MessageRenderer from './MessageRenderer.js';

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
        oldestMessageId: null,
        historyObserver: null,
        scrollToBottomBtn: null
    };
    static _splitPopup = null;

    static playSound(soundName) {
        if (typeof Audio === 'undefined') return;
        const audio = new Audio(`/sounds/${soundName}.mp3`);
        audio.volume = 1.0;
        audio.play().catch(() => {});
    }

    static getDirection() {
        if (window.screen?.orientation) {
            const type = window.screen.orientation.type;
            return type.includes('portrait') ? 'top' : 'side';
        }
        return window.innerWidth > window.innerHeight ? 'side' : 'top';
    }

    static showDirectionPopup(client, event) {
        this.hideDirectionPopup();
        
        const popup = document.createElement('div');
        popup.className = 'split-popup';
        popup.style.cssText = 'position: absolute; top: 44px; right: 10px; background: #202225; border: 1px solid rgba(79, 84, 92, 0.16); border-radius: 8px; padding: 8px; display: flex; gap: 8px; z-index: 1000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);';
        
        const sideBtn = document.createElement('button');
        sideBtn.className = 'split-popup-btn';
        sideBtn.innerHTML = '📊 Справа';
        sideBtn.title = 'Второй чат справа';
        sideBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            this.hideDirectionPopup();
            await this.toggle(client, 'side');
        });
        
        const topBtn = document.createElement('button');
        topBtn.className = 'split-popup-btn';
        topBtn.innerHTML = '📋 Сверху';
        topBtn.title = 'Второй чат сверху';
        topBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            this.hideDirectionPopup();
            await this.toggle(client, 'top');
        });
        
        popup.appendChild(sideBtn);
        popup.appendChild(topBtn);
        
        const headerControls = document.querySelector('.header-controls');
        if (headerControls) {
            headerControls.style.position = 'relative';
            headerControls.appendChild(popup);
        } else {
            document.body.appendChild(popup);
        }
        
        this._splitPopup = popup;
        
        const closeHandler = (e) => {
            if (!popup.contains(e.target) && !e.target.closest('.split-toggle-btn')) {
                this.hideDirectionPopup();
                document.removeEventListener('click', closeHandler);
            }
        };
        
        setTimeout(() => document.addEventListener('click', closeHandler), 100);
    }

    static hideDirectionPopup() {
        if (this._splitPopup) {
            this._splitPopup.remove();
            this._splitPopup = null;
        }
    }

    static async toggle(client, direction = 'side') {
        this.hideDirectionPopup();
        this.secondaryChat.direction = direction;
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        const wasEnabled = this.secondaryChat.enabled;
        this.secondaryChat.enabled = !wasEnabled;
        
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

            this._destroyHistoryObserver();
            
            this.secondaryChat = {
                enabled: false, direction: 'side', roomId: null,
                container: null, messagesContainer: null, inputEl: null,
                roomSelector: null, roomList: null,
                isLoading: false, hasMore: true, oldestMessageId: null,
                historyObserver: null,
                scrollToBottomBtn: null
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
                if (client?.toggleSecondaryChat) {
                    client.toggleSecondaryChat(this.secondaryChat.direction);
                }
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
                    const replyTarget = UIManager.getReplyTarget();
                    let replyTo = null;
                    if (replyTarget && replyTarget.id) {
                        replyTo = { id: replyTarget.id, username: replyTarget.username };
                    }
                    await client.sendSecondaryMessage(text, this.secondaryChat.roomId, replyTo);
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
            console.error('❌ [SECONDARY] Ошибка загрузки комнат:', error);
            roomList.innerHTML = '<div class="no-results">Ошибка загрузки</div>';
        }
    }

    static _setupHistoryObserver() {
        this._destroyHistoryObserver();
        
        const container = this.secondaryChat.messagesContainer;
        if (!container) return;
        
        let sentinel = container.querySelector('.history-sentinel');
        if (!sentinel) {
            sentinel = document.createElement('div');
            sentinel.className = 'history-sentinel';
            sentinel.style.cssText = 'height: 1px; width: 100%; margin: 0; padding: 0; overflow: hidden; visibility: hidden;';
            container.prepend(sentinel);
        }
        
        this.secondaryChat.historyObserver = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && this.secondaryChat.hasMore && !this.secondaryChat.isLoading) {
                    this._loadMoreHistory();
                }
            },
            { root: container, rootMargin: '150px 0px 0px 0px', threshold: 0.01 }
        );
        this.secondaryChat.historyObserver.observe(sentinel);
    }

    static _destroyHistoryObserver() {
        if (this.secondaryChat.historyObserver) {
            this.secondaryChat.historyObserver.disconnect();
            this.secondaryChat.historyObserver = null;
        }
    }

    static async _loadMoreHistory() {
        const client = window.voiceClient;
        if (!client || this.secondaryChat.isLoading || !this.secondaryChat.hasMore || !this.secondaryChat.roomId) return;
        
        this.secondaryChat.isLoading = true;
        
        try {
            const result = await TextChatManager.loadMoreMessages(client, this.secondaryChat.roomId, this.secondaryChat.oldestMessageId);
            
            if (result && result.messages && result.messages.length > 0) {
                const container = this.secondaryChat.messagesContainer;
                const sentinel = container.querySelector('.history-sentinel');
                const oldScrollHeight = container.scrollHeight;
                
                const existingIds = new Set();
                container.querySelectorAll('.message[data-message-id]').forEach(el => existingIds.add(el.dataset.messageId));
                
                const fragment = document.createDocumentFragment();
                let hasNewMessages = false;
                
                for (const msg of result.messages) {
                    if (existingIds.has(msg.id)) continue;
                    
                    hasNewMessages = true;
                    const el = MessageRenderer._createMessageElement(
                        msg.username, msg.text, msg.timestamp, msg.type,
                        msg.imageUrl, msg.id, msg.readBy || [], msg.userId,
                        false, msg.thumbnailUrl, msg.replyTo,
                        msg.reactions || {}, msg.poll, msg.forwardedFrom, msg.pollRef
                    );
                    if (el) {
                        el.classList.add('appeared');
                        fragment.appendChild(el);
                    }
                }
                
                if (hasNewMessages) {
                    if (sentinel) {
                        container.insertBefore(fragment, sentinel);
                    } else {
                        container.prepend(fragment);
                    }
                    
                    requestAnimationFrame(() => {
                        const newScrollHeight = container.scrollHeight;
                        container.scrollTop = newScrollHeight - oldScrollHeight;
                    });
                }
                
                this.secondaryChat.oldestMessageId = result.messages[0].id;
                this.secondaryChat.hasMore = result.hasMore;
                
                if (!this.secondaryChat.hasMore) {
                    this._destroyHistoryObserver();
                    if (sentinel) sentinel.remove();
                }
            } else {
                this.secondaryChat.hasMore = false;
                this._destroyHistoryObserver();
                const sentinel = container?.querySelector('.history-sentinel');
                if (sentinel) sentinel.remove();
            }
        } catch (error) {
            console.error('❌ [SECONDARY] Ошибка загрузки истории:', error.message);
        } finally {
            this.secondaryChat.isLoading = false;
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
            messagesContainer.innerHTML = '<div class="loading-state" style="text-align: center; padding: 20px; color: #888;">⏳ Загрузка...</div>';
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
                
                if (secChat.hasMore) {
                    this._setupHistoryObserver();
                }
            } else {
                if (messagesContainer) {
                    messagesContainer.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px; color: #888;">Нет сообщений</div>';
                }
                secChat.hasMore = false;
            }

            let serverId = roomId;
            const isPrivate = roomId.startsWith('user_') && roomId.includes('_user_');
            if (!isPrivate) {
                const room = client.rooms?.find((r) => r.id === roomId);
                if (room?.serverId) serverId = room.serverId;
            }
            UIManager.clearUnreadForRoom(serverId, roomId);
            
            if (messagesContainer) {
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
            }
        } catch (error) {
            console.error('❌ [SECONDARY] Ошибка загрузки:', error.message);
            if (messagesContainer) {
                messagesContainer.innerHTML = `<div class="error-message" style="text-align: center; padding: 20px; color: #e74c3c;">Ошибка загрузки: ${error.message}</div>`;
            }
        } finally {
            secChat.isLoading = false;
            client.secondaryChat.isLoading = false;
        }
    }

static addMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readState = 0, userId = null, broadcast = false, thumbnailUrl = null, replyTo = null, reactions = {}, poll = null, forwardedFrom = null, pollRef = null) {
    if (!this.secondaryChat.enabled || !this.secondaryChat.messagesContainer) {
        return;
    }
    
    const container = this.secondaryChat.messagesContainer;
    
    if (messageId && container.querySelector(`.message[data-message-id="${messageId}"]`)) {
        return;
    }

    const client = window.voiceClient;
    let fullImageUrl = imageUrl;
    let fullThumbnailUrl = thumbnailUrl;
    
    if (fullImageUrl && fullImageUrl.startsWith('/')) {
        fullImageUrl = (client?.API_SERVER_URL || '') + fullImageUrl;
    }
    if (fullThumbnailUrl && fullThumbnailUrl.startsWith('/')) {
        fullThumbnailUrl = (client?.API_SERVER_URL || '') + fullThumbnailUrl;
    }

    if (client && type !== 'image' && user !== client.username) {
        client.playSound('message');
    }

    const messageElement = MessageRenderer._createMessageElement(
        user, text, timestamp, type, fullImageUrl, messageId, 
        readState, userId, broadcast, fullThumbnailUrl, replyTo, 
        reactions || {}, poll, forwardedFrom, pollRef
    );
    
    if (!messageElement) {
        return;
    }
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    
    container.appendChild(messageElement);
    
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
    
    setTimeout(() => {
        messageElement.classList.add('appeared');
        MessageRenderer.highlightCodeBlocks(container);
    }, 10);

    if (this.secondaryChat.roomId) {
        let serverId = this.secondaryChat.roomId;
        const isPrivate = this.secondaryChat.roomId.startsWith('user_') && this.secondaryChat.roomId.includes('_user_');
        if (!isPrivate && window.voiceClient) {
            const room = window.voiceClient.rooms?.find((r) => r.id === this.secondaryChat.roomId);
            if (room?.serverId) serverId = room.serverId;
        }
        UIManager.clearUnreadForRoom(serverId, this.secondaryChat.roomId);
    }
}

    static updateMessageReactions(messageId, reactions) {
        if (!this.secondaryChat.enabled || !this.secondaryChat.messagesContainer) return;
        
        const msgEl = this.secondaryChat.messagesContainer.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;
        
        MessageRenderer.updateMessageReactions(messageId, reactions);
    }

    static updateMessageReadStatus(messageId, readBy) {
        if (!this.secondaryChat.enabled || !this.secondaryChat.messagesContainer) return;
        
        const msgEl = this.secondaryChat.messagesContainer.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;
        
        MessageRenderer.updateMessageReadStatus(messageId, readBy);
    }

    static removeMessageFromUI(messageId) {
        if (!this.secondaryChat.enabled || !this.secondaryChat.messagesContainer) return;
        
        const msgEl = this.secondaryChat.messagesContainer.querySelector(`.message[data-message-id="${messageId}"]`);
        if (msgEl) {
            msgEl.style.transition = 'all 0.3s ease';
            msgEl.style.opacity = '0';
            msgEl.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                if (msgEl && msgEl.parentNode) {
                    msgEl.remove();
                }
            }, 300);
        }
    }

    static updatePollInSecondary(originalPollId, pollData) {
        if (!this.secondaryChat.enabled || !this.secondaryChat.messagesContainer) {
            return;
        }
        
        const allMessages = this.secondaryChat.messagesContainer.querySelectorAll('.message.poll-message');
        let updatedCount = 0;
        
        allMessages.forEach(msgEl => {
            try {
                const existingData = JSON.parse(msgEl.dataset.pollData || '{}');
                if (existingData.pollRef && existingData.pollRef.originalPollId === originalPollId) {
                    const updatedPollData = { ...existingData, poll: pollData };
                    msgEl.dataset.pollData = JSON.stringify(updatedPollData);
                    
                    const pollContainer = msgEl.querySelector('.poll-container');
                    if (pollContainer) {
                        import('./PollWidget.js').then(module => {
                            const PollWidget = module.default;
                            const client = window.voiceClient;
                            PollWidget.render(pollContainer, {
                                poll: pollData,
                                messageId: msgEl.dataset.messageId,
                                roomId: client?.currentRoom,
                                userId: client?.userId,
                                pollRef: existingData.pollRef
                            }, client);
                            updatedCount++;
                        });
                    }
                }
            } catch (e) {
                const pollRefAttr = msgEl.dataset.pollRef;
                if (pollRefAttr) {
                    try {
                        const pollRef = JSON.parse(pollRefAttr);
                        if (pollRef.originalPollId === originalPollId) {
                            const client = window.voiceClient;
                            const pollContainer = msgEl.querySelector('.poll-container');
                            if (pollContainer) {
                                import('./PollWidget.js').then(module => {
                                    const PollWidget = module.default;
                                    PollWidget.render(pollContainer, {
                                        poll: pollData,
                                        messageId: msgEl.dataset.messageId,
                                        roomId: client?.currentRoom,
                                        userId: client?.userId,
                                        pollRef: pollRef
                                    }, client);
                                    updatedCount++;
                                });
                            }
                        }
                    } catch (e2) {}
                }
            }
        });
    }

    static async openDirect(client, roomId) {
        if (!client || !roomId) return;
        if (this.secondaryChat.enabled && this.secondaryChat.roomId === roomId) return;
        
        const direction = this.getDirection();
        
        if (!this.secondaryChat.enabled) {
            await this.toggle(client, direction);
        }
        
        setTimeout(async () => {
            if (this.secondaryChat.enabled) {
                await this.joinRoom(client, roomId);
            }
        }, 200);
    }

    static clearMessages() {
        if (!this.secondaryChat.messagesContainer) return;
        this.secondaryChat.messagesContainer.innerHTML = '';
        this._destroyHistoryObserver();
        this.secondaryChat.hasMore = true;
        this.secondaryChat.oldestMessageId = null;
        this.secondaryChat.isLoading = false;
    }
}

export default SecondaryChatManager;
