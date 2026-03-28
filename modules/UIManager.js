// modules/UIManager.js
import MembersManager from './MembersManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';

class UIManager {
    static client = null;
    static unreadCounts = {};
    static unreadVersion = 0;
    static unreadLastSync = null;
    static usernameCache = new Map();
    static contextMenu = null;

    static setClient(client) {
        this.client = client;
    }

    // ============================================================================
    // 🔥 НОВАЯ ФУНКЦИЯ: Создание контекстного меню для сообщений
    // ============================================================================
    static showMessageContextMenu(event, messageId, userId, username, timestamp) {
        event.preventDefault();
        event.stopPropagation();

        // Удаляем существующее меню если есть
        if (this.contextMenu) {
            this.contextMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'message-context-menu';
        menu.style.cssText = `
            position: fixed;
            background: #2d2d44;
            border: 1px solid #404060;
            border-radius: 8px;
            padding: 8px 0;
            min-width: 200px;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        `;

        const isOwnMessage = this.client && this.client.userId === userId;
        const canDelete = isOwnMessage || (this.client && this.client.currentServer && this.client.currentServer.ownerId === this.client.userId);

        // Пункт меню: Информация
        const infoItem = document.createElement('div');
        infoItem.className = 'context-menu-item';
        infoItem.innerHTML = `
            <span class="context-menu-icon">ℹ️</span>
            <span class="context-menu-text">Информация</span>
        `;
        infoItem.style.cssText = `
            padding: 10px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            color: #e0e0e0;
            transition: background 0.2s;
        `;
        infoItem.addEventListener('mouseenter', () => {
            infoItem.style.background = '#3d3d5c';
        });
        infoItem.addEventListener('mouseleave', () => {
            infoItem.style.background = 'transparent';
        });
        infoItem.addEventListener('click', () => {
            this.showMessageInfo(messageId, userId, username, timestamp);
            this.hideContextMenu();
        });
        menu.appendChild(infoItem);

        // Разделитель
        if (canDelete) {
            const separator = document.createElement('div');
            separator.style.cssText = `
                height: 1px;
                background: #404060;
                margin: 4px 0;
            `;
            menu.appendChild(separator);

            // Пункт меню: Удалить
            const deleteItem = document.createElement('div');
            deleteItem.className = 'context-menu-item delete';
            deleteItem.innerHTML = `
                <span class="context-menu-icon">🗑️</span>
                <span class="context-menu-text">Удалить</span>
            `;
            deleteItem.style.cssText = `
                padding: 10px 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                color: #ed4245;
                transition: background 0.2s;
            `;
            deleteItem.addEventListener('mouseenter', () => {
                deleteItem.style.background = 'rgba(237, 66, 69, 0.1)';
            });
            deleteItem.addEventListener('mouseleave', () => {
                deleteItem.style.background = 'transparent';
            });
            deleteItem.addEventListener('click', () => {
                this.confirmDeleteMessage(messageId);
                this.hideContextMenu();
            });
            menu.appendChild(deleteItem);
        }

        // Позиционируем меню
        const x = event.clientX;
        const y = event.clientY;
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        // Проверяем чтобы меню не выходило за пределы экрана
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }

        document.body.appendChild(menu);
        this.contextMenu = menu;

        // Закрытие по клику вне меню
        const closeHandler = () => {
            this.hideContextMenu();
            document.removeEventListener('click', closeHandler);
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
        }, 100);

        // Закрытие по Escape
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.hideContextMenu();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    static hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    // ============================================================================
    // 🔥 НОВАЯ ФУНКЦИЯ: Показать информацию о сообщении
    // ============================================================================
    static async showMessageInfo(messageId, userId, username, timestamp) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/messages/${this.client.currentRoom}/${messageId}/info`, {
                headers: {
                    'Authorization': `Bearer ${this.client.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Не удалось получить информацию');
            }

            const data = await response.json();
            const message = data.message;

            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10001;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: #2d2d44;
                border-radius: 12px;
                padding: 24px;
                max-width: 500px;
                width: 90%;
                border: 1px solid #404060;
            `;

            content.innerHTML = `
                <h3 style="margin: 0 0 20px 0; color: #e0e0e0;">📋 Информация о сообщении</h3>
                <div style="color: #b0b0c0; line-height: 1.8;">
                    <div><strong>ID:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.id}</code></div>
                    <div style="margin-top: 12px;"><strong>Автор:</strong> ${this.escapeHtml(message.username)}</div>
                    <div style="margin-top: 8px;"><strong>ID автора:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.userId}</code></div>
                    <div style="margin-top: 8px;"><strong>Время:</strong> ${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
                    <div style="margin-top: 8px;"><strong>Тип:</strong> ${message.type || 'text'}</div>
                    <div style="margin-top: 8px;"><strong>Комната:</strong> <code style="background: #1a1a2e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${message.roomId}</code></div>
                    ${message.text ? `<div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px;"><strong>Текст:</strong><br><span style="color: #e0e0e0;">${this.escapeHtml(message.text)}</span></div>` : ''}
                </div>
                <button id="closeInfoModal" style="
                    margin-top: 20px;
                    padding: 10px 24px;
                    background: #5865f2;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                ">Закрыть</button>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            const closeBtn = content.querySelector('#closeInfoModal');
            closeBtn.addEventListener('click', () => {
                modal.remove();
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
        } catch (error) {
            console.error('Ошибка получения информации о сообщении:', error);
            this.showError('Не удалось получить информацию о сообщении');
        }
    }

    // ============================================================================
    // 🔥 НОВАЯ ФУНКЦИЯ: Подтверждение удаления сообщения
    // ============================================================================
    static async confirmDeleteMessage(messageId) {
        const confirmed = confirm('Вы уверены, что хотите удалить это сообщение? Это действие нельзя отменить.');
        if (!confirmed) return;

        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/messages/${this.client.currentRoom}/${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.client.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Не удалось удалить сообщение');
            }

            console.log(`✅ [UI] Сообщение ${messageId} удалено`);
            // Сообщение будет удалено из UI через socket event 'message-deleted'
        } catch (error) {
            console.error('Ошибка удаления сообщения:', error);
            this.showError('Не удалось удалить сообщение: ' + error.message);
        }
    }

    static async fetchUsername(userId) {
        if (!userId) return 'Unknown';
        if (this.usernameCache.has(userId)) {
            return this.usernameCache.get(userId);
        }
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${this.client.token}`,
                    'Content-Type': 'application/json'
                }
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
        const missing = userIds.filter(id => !this.usernameCache.has(id));
        if (missing.length === 0) return;
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/users/batch?userIds=${missing.join(',')}`, {
                headers: {
                    'Authorization': `Bearer ${this.client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.users) {
                    for (const [userId, userData] of Object.entries(data.users)) {
                        this.usernameCache.set(userId, userData.username || userId.replace('user_', ''));
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка получения имён пользователей:', error);
        }
    }

    static syncUnreadCounts(serverData) {
        this.unreadVersion++;
        this.unreadLastSync = new Date().toISOString();
        console.log(`🎨 [UI] Sync #${this.unreadVersion} at ${this.unreadLastSync}`);
        console.log('📬 [UI] Полная синхронизация непрочитанных:', serverData);
        this.unreadCounts = {};
        for (const [serverId, rooms] of Object.entries(serverData)) {
            if (!this.unreadCounts[serverId]) {
                this.unreadCounts[serverId] = {
                    total: 0,
                    personalTotal: 0,
                    hasMentionTotal: false,
                    rooms: {}
                };
            }
            for (const [roomId, roomData] of Object.entries(rooms)) {
                this.unreadCounts[serverId].rooms[roomId] = {
                    count: roomData.count || 0,
                    hasMention: roomData.hasMention || false,
                    personalCount: roomData.personalCount || 0
                };
                this.unreadCounts[serverId].total += roomData.count || 0;
                this.unreadCounts[serverId].personalTotal += roomData.personalCount || 0;
                if (roomData.hasMention) {
                    this.unreadCounts[serverId].hasMentionTotal = true;
                }
            }
        }
        this.updateServerBadges();
        this.updateRoomBadges();
        this.updateTotalBadge();
        if (this.client) {
            this.updateRoomTitleBadge(this.client);
        }
    }

    static updateStatus(text, status) {
        const statusText = document.querySelector('.status-text');
        const statusIndicator = document.querySelector('.status-indicator');
        if (statusText) {
            statusText.textContent = text;
        }
        if (statusIndicator) {
            statusIndicator.className = 'status-indicator';
            if (status === 'connecting') {
                statusIndicator.classList.add('connecting');
            } else if (status === 'disconnected') {
                statusIndicator.classList.add('disconnected');
            } else if (status === 'connected') {
                statusIndicator.classList.add('connected');
            }
        }
    }

// ============================================================================
// 🔥 ИСПРАВЛЕНО: addMessage - поддержка thumbnailUrl
// ============================================================================
static addMessage(user, text, timestamp = null, type = 'text', imageUrl = null,
    messageId = null, readBy = [], userId = null, broadcast = false,
    thumbnailUrl = null) {
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;

    const safeUser = user || 'Unknown';
    const safeText = text || '';
    const client = this.client || window.voiceClient;
    const isOwn = client && client.username && safeUser === client.username;

    const messageElement = document.createElement('div');
    messageElement.className = 'message' + (type === 'system' ? ' system-message' : '');
    if (messageId) messageElement.dataset.messageId = messageId;
    if (userId) messageElement.dataset.userId = userId;
    if (timestamp) messageElement.dataset.timestamp = timestamp;
    if (readBy?.length) messageElement.dataset.readBy = JSON.stringify(readBy);
    if (broadcast) messageElement.dataset.broadcast = 'true';

    messageElement.addEventListener('contextmenu', (event) => {
        if (messageId && userId) {
            this.showMessageContextMenu(event, messageId, userId, safeUser, timestamp);
        }
    });

    const time = timestamp
        ? new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    let finalImageUrl = imageUrl;
    let finalThumbnailUrl = thumbnailUrl;

    if (imageUrl?.startsWith('/')) {
        if (client?.API_SERVER_URL) {
            finalImageUrl = client.API_SERVER_URL + imageUrl;
        }
    }

    if (thumbnailUrl?.startsWith('/')) {
        if (client?.API_SERVER_URL) {
            finalThumbnailUrl = client.API_SERVER_URL + thumbnailUrl;
        }
    }

    const avatarHtml = (isOwn && type !== 'system') ? '' :
        `<div class="message-avatar">${safeUser.charAt(0).toUpperCase()}</div>`;

    if (type === 'image') {
        // 🔥 ИСПОЛЬЗУЕМ МИНИАТЮРУ ДЛЯ ОТОБРАЖЕНИЯ
        const displayUrl = finalThumbnailUrl || finalImageUrl;
        messageElement.innerHTML = `
${avatarHtml}
<div class="message-content${isOwn ? ' own' : ''}">
    <div class="message-header">
        <span class="message-username">${this.escapeHtml(safeUser)}</span>
        <span class="message-time">${time}</span>
    </div>
    <div class="message-text">
        <div class="image-thumbnail" data-full-size="${this.escapeHtml(finalImageUrl)}" style="cursor: pointer;">
            <img src="${this.escapeHtml(displayUrl)}" alt="Изображение" loading="lazy"
                style="max-width: 320px; max-height: 240px; border-radius: 8px; object-fit: cover; border: none !important; outline: none !important; box-shadow: none !important; display: block;">
            <div class="image-overlay">🔍 Нажмите для просмотра</div>
        </div>
    </div>
</div>
`;
        const imageThumbnail = messageElement.querySelector('.image-thumbnail');
        if (imageThumbnail && finalImageUrl) {
            imageThumbnail.addEventListener('click', () => {
                this.openImageModal(finalImageUrl);
            });
        }
    } else {
        const formattedText = type === 'system'
            ? `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; background: #1a1a2e; padding: 10px; border-radius: 5px; overflow-x: auto;">${this.escapeHtml(safeText)}</pre>`
            : this.escapeHtmlAndFormat(safeText);

        messageElement.innerHTML = `
${avatarHtml}
<div class="message-content${isOwn ? ' own' : ''}">
    <div class="message-header">
        <span class="message-username">${this.escapeHtml(safeUser)}</span>
        <span class="message-time">${time}</span>
    </div>
    <div class="message-text">${formattedText}</div>
</div>
`;
    }

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    setTimeout(() => messageElement.classList.add('appeared'), 10);
}

    static openImageModal(imageUrl) {
        const existingModal = document.querySelector('.image-modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'image-modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            cursor: zoom-out;
        `;

        const imageElement = document.createElement('img');
        imageElement.src = imageUrl;
        imageElement.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 24px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        closeBtn.addEventListener('click', () => {
            modalOverlay.remove();
        });

        modalOverlay.appendChild(imageElement);
        modalOverlay.appendChild(closeBtn);

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });

        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                modalOverlay.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        document.body.appendChild(modalOverlay);
    }

    static updateMessageReadStatus(messageId, readerId, readerName) {
        const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;
        const readBy = JSON.parse(msgEl.dataset.readBy || '[]');
        if (!readBy.includes(readerId)) {
            readBy.push(readerId);
            msgEl.dataset.readBy = JSON.stringify(readBy);
        }
        const timeEl = msgEl.querySelector('.message-time');
        if (timeEl) {
            const ownMsg = msgEl.querySelector('.message-content.own');
            if (ownMsg) {
                const readers = readBy.length;
                if (readers === 0) {
                    timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓';
                } else if (readers === 1) {
                    timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓✓';
                } else {
                    timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓✓✓';
                }
            }
        }
    }

    // ============================================================================
    // 🔥 НОВАЯ ФУНКЦИЯ: Удаление сообщения из UI
    // ============================================================================
    static removeMessageFromUI(messageId) {
        const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.style.transition = 'all 0.3s ease';
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateX(-20px)';
            setTimeout(() => {
                if (messageElement && messageElement.parentNode) {
                    messageElement.remove();
                }
            }, 300);
            console.log(`🗑️ [UI] Сообщение ${messageId} удалено из интерфейса`);
        }
    }

    static updateMicButton(status) {
        const states = {
            'disconnected': { class: 'disconnected', text: '🎤', title: 'Не подключен к голосовому каналу' },
            'connecting': { class: 'connecting', text: '🎤', title: 'Подключение...' },
            'connected': { class: 'connected', text: '🎤', title: 'Микрофон выключен (нажмите чтобы включить)' },
            'active': { class: 'active', text: '🔴', title: 'Микрофон включен (нажмите чтобы выключить)' },
            'error': { class: 'error', text: '🎤', title: 'Ошибка доступа к микрофону' }
        };
        const state = states[status] || states.disconnected;
        const selectors = ['.mic-button', '.mic-toggle-btn'];
        selectors.forEach(sel => {
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

    static escapeHtmlAndFormat(text) {
        if (!text) return '';
        let processed = text.replace(/\n/g, '\n');
        processed = processed
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        processed = processed.replace(/{#([0-9A-Fa-f]{6})}([^{}]*){}/g, (match, color, content) => {
            if (!/^#[0-9A-Fa-f]{6}$/.test('#' + color)) return match;
            return `<span style="color:#${color}">${content}</span>`;
        });
        processed = processed.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>');
        processed = processed.replace(/__([^_]+?)__/g, '<u>$1</u>');
        processed = processed.replace(/~~([^~]+?)~~/g, '<s>$1</s>');
        processed = processed.replace(/\*([^*]+?)\*/g, '<i>$1</i>');
        processed = processed.replace(/\n/g, '<br>');
        return processed;
    }

    static escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ... остальные методы UIManager без изменений ...

    static updateMembersListWithStatus(onlineMembers, offlineMembers) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) {
            console.error('❌ Members list element not found');
            return;
        }

        const savedSliderValues = new Map();
        membersList.querySelectorAll('.member-item').forEach(item => {
            const userId = item.dataset.userId;
            const slider = item.querySelector('.member-volume-slider');
            if (userId && slider) {
                let value = VolumeBoostManager.getGain(userId);
                if (value !== null) {
                    savedSliderValues.set(userId, Math.round(value * 100));
                } else {
                    savedSliderValues.set(userId, slider.value);
                }
            }
        });

        membersList.innerHTML = '';

        const onlineHeader = document.createElement('div');
        onlineHeader.className = 'members-section-header online-header';
        onlineHeader.innerHTML = `
            <span class="section-toggle-icon">${MembersManager.isSectionCollapsed('online') ? '▶' : '▼'}</span>
            <span class="section-title">Онлайн (${onlineMembers?.length || 0})</span>
        `;
        onlineHeader.addEventListener('click', () => {
            MembersManager.toggleSection('online');
        });
        membersList.appendChild(onlineHeader);

        const onlineContainer = document.createElement('div');
        onlineContainer.className = 'members-section-content';
        onlineContainer.style.display = MembersManager.isSectionCollapsed('online') ? 'none' : 'block';
        if (onlineMembers && onlineMembers.length > 0) {
            onlineMembers.forEach(user => {
                const memberElement = this._createMemberElement(user, savedSliderValues, true);
                if (memberElement) {
                    onlineContainer.appendChild(memberElement);
                }
            });
        }
        membersList.appendChild(onlineContainer);

        const offlineHeader = document.createElement('div');
        offlineHeader.className = 'members-section-header offline-header';
        offlineHeader.innerHTML = `
            <span class="section-toggle-icon">${MembersManager.isSectionCollapsed('offline') ? '▶' : '▼'}</span>
            <span class="section-title">Офлайн (${offlineMembers?.length || 0})</span>
        `;
        offlineHeader.addEventListener('click', () => {
            MembersManager.toggleSection('offline');
        });
        membersList.appendChild(offlineHeader);

        const offlineContainer = document.createElement('div');
        offlineContainer.className = 'members-section-content';
        offlineContainer.style.display = MembersManager.isSectionCollapsed('offline') ? 'none' : 'block';
        if (offlineMembers && offlineMembers.length > 0) {
            offlineMembers.forEach(user => {
                const memberElement = this._createMemberElement(user, savedSliderValues, false);
                if (memberElement) {
                    offlineContainer.appendChild(memberElement);
                }
            });
        }
        membersList.appendChild(offlineContainer);

        if ((!onlineMembers || onlineMembers.length === 0) && (!offlineMembers || offlineMembers.length === 0)) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'members-empty';
            emptyMessage.textContent = 'В комнате нет участников';
            membersList.appendChild(emptyMessage);
        }

        this.syncVolumeSliders();
    }

    static _createMemberElement(user, savedSliderValues, isOnline) {
        if (!user || !user.userId) {
            return null;
        }

        const memberElement = document.createElement('div');
        memberElement.className = 'member-item' + (isOnline ? '' : ' offline');
        memberElement.dataset.userId = user.userId;
        memberElement.dataset.clientId = user.clientId || '';

        const savedValue = savedSliderValues.get(user.userId) || 100;

        memberElement.innerHTML = `
            <div class="member-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="member-info">
                <div class="member-name ${isOnline ? '' : 'offline-text'}">${this.escapeHtml(user.username)}</div>
                <div class="member-controls">
                    <div class="member-status">
                        <div class="mic-indicator ${isOnline && user.isMicActive ? 'active' : ''}"
                            title="${user.isMicActive ? 'Микрофон включен' : 'Микрофон выключен'}"></div>
                    </div>
                    <input type="range" class="member-volume-slider" min="0" max="200" value="${savedValue}"
                        title="Громкость: ${savedValue}%" data-producer-id="" style="display: none;">
                </div>
            </div>
        `;

        const slider = memberElement.querySelector('.member-volume-slider');
        if (slider && !slider._hasVolumeHandler) {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                const producerId = e.target.dataset.producerId;
                e.target.title = `Громкость: ${value}%`;
                const userId = window.producerUserMap?.get(producerId) || window.producerClientMap?.get(producerId);
                if (userId) {
                    VolumeBoostManager.setGain(userId, value / 100);
                }
            });
            slider._hasVolumeHandler = true;
        }

        if (isOnline) {
            memberElement.addEventListener('mouseenter', () => {
                if (slider.dataset.producerId) {
                    slider.style.display = 'block';
                }
            });
            memberElement.addEventListener('mouseleave', () => {
                setTimeout(() => {
                    if (!slider.matches(':hover')) {
                        slider.style.display = 'none';
                    }
                }, 100);
            });
            slider.addEventListener('mouseleave', () => {
                slider.style.display = 'none';
            });
        }

        return memberElement;
    }

    static updateMembersList(members) {
        const onlineMembers = members.filter(m => m.isOnline === true);
        const offlineMembers = members.filter(m => m.isOnline !== true);
        this.updateMembersListWithStatus(onlineMembers, offlineMembers);
    }

    static syncVolumeSliders() {
        const membersList = document.querySelector('.members-list');
        if (!membersList) {
            console.error('❌ Members list not found');
            return;
        }

        const memberItems = membersList.querySelectorAll('.member-item:not(.offline)');
        const producerUserMap = window.producerUserMap || new Map();
        const producerClientMap = window.producerClientMap || new Map();

        memberItems.forEach(item => {
            const slider = item.querySelector('.member-volume-slider');
            if (slider) {
                slider.style.display = 'none';
                slider.dataset.producerId = '';
            }
        });

        for (const [producerId, userId] of producerUserMap.entries()) {
            const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
            if (memberItem) {
                const slider = memberItem.querySelector('.member-volume-slider');
                if (slider) {
                    slider.dataset.producerId = producerId;
                    slider.style.display = 'block';
                }
            }
        }

        for (const [producerId, clientId] of producerClientMap.entries()) {
            if (producerUserMap.has(producerId)) continue;
            const memberItem = membersList.querySelector(`.member-item[data-client-id="${clientId}"]:not(.offline)`);
            if (memberItem) {
                const slider = memberItem.querySelector('.member-volume-slider');
                if (slider) {
                    slider.dataset.producerId = producerId;
                    slider.style.display = 'block';
                    const userId = memberItem.dataset.userId;
                    if (userId && !producerUserMap.has(producerId)) {
                        if (!window.producerUserMap) window.producerUserMap = new Map();
                        window.producerUserMap.set(producerId, userId);
                    }
                }
            }
        }
    }

    static showVolumeSliderByUserId(producerId, userId) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) {
            console.error('❌ Members list element not found');
            return;
        }

        const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
        if (memberItem) {
            const slider = memberItem.querySelector('.member-volume-slider');
            if (slider) {
                slider.dataset.producerId = producerId;
                slider.style.display = 'block';
                if (!slider._hasVolumeHandler) {
                    slider.addEventListener('input', (e) => {
                        const value = e.target.value;
                        const pid = e.target.dataset.producerId;
                        e.target.title = `Громкость: ${value}%`;
                        const userId = window.producerUserMap?.get(pid) || window.producerClientMap?.get(pid);
                        if (userId) {
                            VolumeBoostManager.setGain(userId, value / 100);
                        }
                    });
                    slider._hasVolumeHandler = true;
                }
            }
        }
    }

    static updateMemberMicState(userId, isActive) {
        const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
        if (memberElement) {
            const micIndicator = memberElement.querySelector('.mic-indicator');
            if (micIndicator) {
                const isOnline = !memberElement.classList.contains('offline');
                if (isOnline) {
                    micIndicator.className = isActive ? 'mic-indicator active' : 'mic-indicator';
                    micIndicator.title = isActive ? 'Микрофон включен' : 'Микрофон выключен';
                } else {
                    micIndicator.className = 'mic-indicator';
                    micIndicator.title = 'Микрофон выключен';
                }
            }
        }
    }

    static openModal(title, content, onSubmit) {
        const modalOverlay = document.querySelector('.modal-overlay');
        const modalContent = document.querySelector('.modal-content');
        if (!modalOverlay || !modalContent) return;

        modalContent.innerHTML = `
            <h2>${title}</h2>
            ${content}
            <button class="modal-submit">OK</button>
        `;
        modalOverlay.classList.remove('hidden');

        const submitButton = modalContent.querySelector('.modal-submit');
        if (submitButton && onSubmit) {
            submitButton.addEventListener('click', onSubmit);
        }
    }

    static closeModal() {
        const modalOverlay = document.querySelector('.modal-overlay');
        if (modalOverlay) modalOverlay.classList.add('hidden');
    }

    static showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        errorElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ed4245;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 1000;
            max-width: 300px;
        `;
        document.body.appendChild(errorElement);
        setTimeout(() => {
            if (document.body.contains(errorElement)) {
                document.body.removeChild(errorElement);
            }
        }, 5000);
    }

    static async updateRoomUI(client) {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        let roomTitle = 'Выберите комнату';
        if (client.currentRoom) {
            const currentRoomData = client.rooms.find(room => room.id === client.currentRoom);
            if (currentRoomData) {
                const isPrivate = RoomManager.isPrivateRoom(client.currentRoom);
                if (isPrivate) {
                    const displayName = await RoomManager.getPrivateRoomDisplayName(client.currentRoom, client.userId, client.currentServer);
                    roomTitle = `👤 ${displayName || currentRoomData.name}`;
                } else {
                    roomTitle = `Комната: ${currentRoomData.name}`;
                }
            } else {
                const isPrivate = RoomManager.isPrivateRoom(client.currentRoom);
                if (isPrivate) {
                    const displayName = await RoomManager.getPrivateRoomDisplayName(client.currentRoom, client.userId, client.currentServer);
                    roomTitle = `👤 ${displayName || client.currentRoom}`;
                } else {
                    roomTitle = `Комната: ${client.currentRoom}`;
                }
            }
        }

        this.updateRoomTitle(roomTitle);
        this.updateMicButton(client.isConnected ? (client.isMicActive ? 'active' : 'connected') : 'disconnected');
        this.updateRoomTitleBadge(client);
        this.updateTotalBadge();
    }

    static updateRoomTitle(title) {
        const titleElement = document.querySelector('.current-room-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }

    static updateRoomTitleBadge(client) {
        const titleElement = document.querySelector('.current-room-title');
        if (!titleElement) return;

        const existingBadge = titleElement.querySelector('.room-unread-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        if (!client || !client.currentRoom) {
            return;
        }

        let roomUnreadData = null;
        for (const serverId in this.unreadCounts) {
            if (this.unreadCounts[serverId].rooms?.[client.currentRoom]) {
                roomUnreadData = this.unreadCounts[serverId].rooms[client.currentRoom];
                break;
            }
        }

        if (roomUnreadData && roomUnreadData.count > 0) {
            const badge = document.createElement('span');
            badge.className = 'room-unread-badge';
            if (roomUnreadData.personalCount > 0) {
                badge.textContent = `${roomUnreadData.count}@${roomUnreadData.personalCount}`;
            } else {
                badge.textContent = roomUnreadData.count;
            }
            titleElement.appendChild(badge);
        }
    }

    static clearMessages() {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
    }

    static setUnreadCount(serverId, roomId, count, hasMention, personalCount = 0) {
        if (!serverId) {
            console.warn('⚠️ setUnreadCount: serverId is empty, using roomId');
            serverId = roomId;
        }

        let normalizedServerId = serverId;
        if (serverId.startsWith('user_') || serverId.startsWith('direct_')) {
            normalizedServerId = roomId || serverId;
        }

        if (!this.unreadCounts[normalizedServerId]) {
            this.unreadCounts[normalizedServerId] = {
                total: 0,
                personalTotal: 0,
                hasMentionTotal: false,
                rooms: {}
            };
        }

        this.unreadCounts[normalizedServerId].rooms[roomId] = { count, hasMention, personalCount };
        this.unreadCounts[normalizedServerId].total = 0;
        this.unreadCounts[normalizedServerId].personalTotal = 0;
        this.unreadCounts[normalizedServerId].hasMentionTotal = false;

        for (const rid in this.unreadCounts[normalizedServerId].rooms) {
            const data = this.unreadCounts[normalizedServerId].rooms[rid];
            this.unreadCounts[normalizedServerId].total += data.count || 0;
            this.unreadCounts[normalizedServerId].personalTotal += data.personalCount || 0;
            if (data.hasMention) {
                this.unreadCounts[normalizedServerId].hasMentionTotal = true;
            }
        }

        console.log(`📬 [UI] setUnreadCount: Server ${normalizedServerId}, Room ${roomId} = ${count} total, ${personalCount} personal`);

        this.updateServerBadges();
        this.updateRoomBadges();
        this.updateTotalBadge();
        this.updateRoomTitleBadge(this.client);
    }

    static updateServerBadges() {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) return;

        const serverItems = serversList.querySelectorAll('.server-item');
        serverItems.forEach(item => {
            const serverId = item.dataset.server;
            const existingBadge = item.querySelector('.unread-badge');
            if (existingBadge) {
                existingBadge.remove();
            }

            let serverData = this.unreadCounts[serverId];

            if (!serverData && serverId && serverId.startsWith('user_')) {
                for (const sid in this.unreadCounts) {
                    if (sid === serverId) {
                        serverData = this.unreadCounts[sid];
                        break;
                    }
                }
            }

            if (!serverData && this.unreadCounts['null']) {
                const nullData = this.unreadCounts['null'];
                if (nullData.rooms && nullData.rooms[serverId]) {
                    serverData = {
                        total: nullData.rooms[serverId].count || 0,
                        personalTotal: nullData.rooms[serverId].personalCount || 0,
                        hasMentionTotal: nullData.rooms[serverId].hasMention || false
                    };
                }
            }

            if (serverData && serverData.total > 0) {
                const badge = document.createElement('span');
                badge.className = 'unread-badge' + (serverData.hasMentionTotal ? ' has-mention' : '');
                if (serverData.personalTotal > 0) {
                    badge.textContent = `${serverData.total}@${serverData.personalTotal}`;
                } else {
                    badge.textContent = serverData.total;
                }
                item.appendChild(badge);
            }
        });
    }

    static updateRoomBadges() {
        const roomsList = document.querySelector('.rooms-list');
        if (!roomsList) return;

        const roomItems = roomsList.querySelectorAll('.room-item');
        roomItems.forEach(item => {
            const roomId = item.dataset.room;
            const existingBadge = item.querySelector('.room-unread-badge');
            if (existingBadge) {
                existingBadge.remove();
            }

            for (const serverId in this.unreadCounts) {
                const roomData = this.unreadCounts[serverId].rooms?.[roomId];
                if (roomData && roomData.count > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'room-unread-badge' + (roomData.hasMention ? ' has-mention' : '');
                    if (roomData.personalCount > 0) {
                        badge.textContent = `${roomData.count}@${roomData.personalCount}`;
                    } else {
                        badge.textContent = roomData.count;
                    }
                    item.appendChild(badge);
                    break;
                }
            }
        });
    }

    static updateTotalBadge() {
        let totalCount = 0;
        let totalPersonalCount = 0;
        let totalHasMention = false;

        for (const serverId in this.unreadCounts) {
            totalCount += this.unreadCounts[serverId].total || 0;
            totalPersonalCount += this.unreadCounts[serverId].personalTotal || 0;
            if (this.unreadCounts[serverId].hasMentionTotal) {
                totalHasMention = true;
            }
        }

        const currentRoomTitle = document.querySelector('.current-room-title');
        if (currentRoomTitle) {
            let existingTitleBadge = currentRoomTitle.querySelector('.title-unread-badge');
            if (existingTitleBadge) {
                existingTitleBadge.remove();
            }

            if (totalCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'title-unread-badge';
                badge.textContent = totalCount > 99 ? '99+' : totalCount;
                currentRoomTitle.appendChild(badge);
            }
        }
    }

    static clearUnreadForServer(serverId) {
        if (this.unreadCounts[serverId]) {
            delete this.unreadCounts[serverId];
            this.updateServerBadges();
            this.updateRoomBadges();
            this.updateTotalBadge();
        }
    }

    static clearUnreadForRoom(serverId, roomId) {
        if (!serverId) {
            serverId = roomId;
        }

        let normalizedServerId = serverId;
        if (serverId.startsWith('user_') || serverId.startsWith('direct_')) {
            normalizedServerId = roomId || serverId;
        }

        if (this.unreadCounts[normalizedServerId]?.rooms?.[roomId]) {
            delete this.unreadCounts[normalizedServerId].rooms[roomId];
            this.unreadCounts[normalizedServerId].total = 0;
            this.unreadCounts[normalizedServerId].personalTotal = 0;
            this.unreadCounts[normalizedServerId].hasMentionTotal = false;

            for (const rid in this.unreadCounts[normalizedServerId].rooms) {
                const data = this.unreadCounts[normalizedServerId].rooms[rid];
                this.unreadCounts[normalizedServerId].total += data.count || 0;
                this.unreadCounts[normalizedServerId].personalTotal += data.personalCount || 0;
                if (data.hasMention) {
                    this.unreadCounts[normalizedServerId].hasMentionTotal = true;
                }
            }

            if (this.unreadCounts[normalizedServerId].total === 0) {
                delete this.unreadCounts[normalizedServerId];
            }

            this.updateServerBadges();
            this.updateRoomBadges();
            this.updateTotalBadge();
            this.updateRoomTitleBadge(this.client);
        }
    }

    static clearAllUnread() {
        this.unreadCounts = {};
        this.updateServerBadges();
        this.updateRoomBadges();
        this.updateTotalBadge();
    }

    static getSyncStatus() {
        return {
            version: this.unreadVersion,
            lastSync: this.unreadLastSync,
            localTotal: this.getLocalUnreadTotal()
        };
    }

    static getLocalUnreadTotal() {
        let total = 0;
        for (const serverId in this.unreadCounts) {
            total += this.unreadCounts[serverId].total || 0;
        }
        return total;
    }
}

export default UIManager;
