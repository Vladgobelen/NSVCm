1// TextChatManager.js
import UIManager from './UIManager.js';

class TextChatManager {
    /**
     * Инициализация обработчиков сокета.
     * Примечание: Основная логика маршрутизации сообщений (включая isForSecondary)
     * теперь находится в VoiceChatClient.setupSocketConnection.
     * Здесь остаются только служебные подписки, если они понадобятся.
     */
    static setupSocketHandlers(client) {
        if (!client.socket) return;

        client.socket.on('connect', () => {
            // При восстановлении соединения можно обновить статус в UI
            UIManager.updateStatus('Подключено', 'connected');
            // Если клиент был в комнате, можно запросить актуальное состояние (опционально)
            if (client.currentRoom) {
                // client.socket.emit('request-room-snapshot', { roomId: client.currentRoom });
            }
        });

        client.socket.on('disconnect', () => {
            UIManager.updateStatus('Отключено', 'disconnected');
        });
    }

    /**
     * Подписка на текстовую комнату (для основного чата)
     * Позволяет серверу знать, что клиент читает эту комнату.
     */
    static joinTextRoom(client, roomId) {
        if (client.socket) {
            client.socket.emit('join-text-room', { roomId });
        }
    }

    /**
     * Отписка от текстовой комнаты
     */
    static leaveTextRoom(client, roomId) {
        if (client.socket) {
            client.socket.emit('leave-text-room', { roomId });
        }
    }

    /**
     * Загрузка следующей порции сообщений (для скролла вверх / истории)
     */
    static loadMoreMessages(client, roomId, beforeMessageId) {
        return this.loadMessages(client, roomId, 50, beforeMessageId);
    }

    /**
     * Загрузка сообщений через Socket.
     * Используется для первичной загрузки истории и подгрузки "наверх".
     *
     * @param {object} client - Экземпляр VoiceChatClient
     * @param {string} roomId - ID комнаты
     * @param {number} limit - Лимит сообщений
     * @param {string|null} beforeId - ID сообщения, до которого грузить (null = последние)
     * @param {HTMLElement|null} targetContainer - Контейнер для рендера (для вторичного чата)
     */
    static loadMessages(client, roomId, limit = 100, beforeId = null, targetContainer = null) {
        return new Promise((resolve, reject) => {
            if (!client.socket?.connected) {
                return reject(new Error('WebSocket не подключен'));
            }

            client.socket.emit('request-message-history', { roomId, limit, beforeId }, (response) => {
                if (response?.success && Array.isArray(response.messages)) {
                    // 1. Если это первая загрузка (без beforeId), очищаем контейнер от старого мусора
                    if (!beforeId) {
                        const container = targetContainer || document.querySelector('.messages-container');
                        if (container) {
                            UIManager.clearContainerMessages(container);
                        }
                    }

                    // 2. Рендерим сообщения
                    if (response.messages.length > 0) {
                        const container = targetContainer || document.querySelector('.messages-container');

                        if (beforeId && container) {
                            // === ЗАГРУЗКА СТАРОЙ ИСТОРИИ (Prepend) ===
                            // Вставляем сообщения перед sentinel (или в начало), сохраняя скролл
                            const sentinel = container.querySelector('.history-sentinel');
                            const refNode = sentinel ? sentinel.nextSibling : container.firstChild;
                            const oldScrollHeight = container.scrollHeight;

                            const fragment = document.createDocumentFragment();
                            for (const msg of response.messages) {
                                const el = UIManager._createMessageElement(
                                    msg.username, msg.text, msg.timestamp, msg.type,
                                    msg.imageUrl, msg.id, msg.readBy || [], msg.userId, false, msg.thumbnailUrl
                                );
                                if (el) {
                                    el.classList.add('appeared');
                                    fragment.appendChild(el);
                                }
                            }
                            container.insertBefore(fragment, refNode);

                            // Коррекция скролла после вставки
                            requestAnimationFrame(() => {
                                const newScrollHeight = container.scrollHeight;
                                container.scrollTop = newScrollHeight - oldScrollHeight;
                            });
                        } else {
                            // === ПЕРВИЧНАЯ ЗАГРУЗКА (Append) ===
                            // Просто добавляем сообщения вниз
                            for (const msg of response.messages) {
                                UIManager.addMessage(
                                    msg.username, msg.text, msg.timestamp, msg.type,
                                    msg.imageUrl, msg.id, msg.readBy || [], msg.userId, false, msg.thumbnailUrl,
                                    container
                                );
                            }
                        }
                    }

                    resolve({ messages: response.messages, hasMore: response.hasMore ?? false });
                } else {
                    reject(new Error(response?.error || 'Не удалось загрузить историю'));
                }
            });
        });
    }

    /**
     * Загрузка изображения (HTTP Multipart)
     * WebSocket не поддерживает бинарные файлы напрямую так удобно, как FormData.
     */
    static async uploadImage(client, roomId, file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new Error('Поддерживаются только JPEG, PNG и WebP');
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error('Файл слишком большой (макс. 5 МБ)');
        }

        const formData = new FormData();
        formData.append('image', file);
        const url = `${client.API_SERVER_URL}/api/messages/upload-image/${roomId}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${client.token}` }, // Токен в заголовке, FormData сама выставит Content-Type
                body: formData
            });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); } catch { errorData = { error: 'Ошибка сервера' }; }
                throw new Error(errorData.error || 'Ошибка загрузки изображения');
            }

            const result = await response.json();
            return { imageUrl: result.imageUrl, thumbnailUrl: result.thumbnailUrl };
        } catch (fetchError) {
            throw fetchError;
        }
    }

    /**
     * Отправка сообщения (Fallback HTTP).
     * Основной поток идет через WebSocket (VoiceChatClient.sendMessage),
     * этот метод используется только при потере соединения.
     */
    static async sendMessage(client, content, type = 'text') {
        if (!client.currentRoom) return;

        // Спец. команда для отладки (обрабатывается локально или отправляется в чат)
        if (type === 'text' && content && content.trim() === '-отладка') {
            if (client.socket) client.socket.emit('send-message', { roomId: client.currentRoom, text: content.trim() });
            return;
        }

        let payload;
        if (type === 'text') {
            if (!content?.trim()) return;
            payload = { roomId: client.currentRoom, type: 'text', text: content.trim() };
        } else if (type === 'image') {
            if (!content?.imageUrl) throw new Error('imageUrl required');
            payload = { roomId: client.currentRoom, type: 'image', imageUrl: content.imageUrl, thumbnailUrl: content.thumbnailUrl };
        } else {
            throw new Error('Unsupported message type');
        }

        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ошибка отправки сообщения');
            }
            return await response.json();
        } catch (error) {
            UIManager.showError('Не удалось отправить сообщение (HTTP fallback failed)');
            throw error;
        }
    }

    /**
     * Отправка сообщения в указанную комнату (Fallback HTTP).
     * Используется ТОЛЬКО для вторичного чата, если в момент отправки
     * основной WebSocket сокет оказался отключен.
     */
    static async sendMessageToRoom(client, roomId, content, type = 'text') {
        if (!roomId || !content?.trim() || !client?.token) {
            throw new Error('Missing roomId, content or token');
        }

        let payload;
        if (type === 'text') {
            payload = { roomId, type: 'text', text: content.trim() };
        } else if (type === 'image') {
            if (!content?.imageUrl) throw new Error('imageUrl required');
            payload = { roomId, type: 'image', imageUrl: content.imageUrl, thumbnailUrl: content.thumbnailUrl };
        } else {
            throw new Error('Unsupported message type');
        }

        const response = await fetch(`${client.API_SERVER_URL}/api/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Ошибка отправки сообщения');
        }
        return await response.json();
    }

    /**
     * Отметка сообщений как прочитанных
     */
    static async markMessagesAsRead(client, messageIds) {
        if (!client.currentRoom || !Array.isArray(messageIds) || messageIds.length === 0) return;
        try {
            await fetch(`${client.API_SERVER_URL}/api/messages/${client.currentRoom}/read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.token}` },
                body: JSON.stringify({ messageIds })
            });
        } catch {
            // Игнорируем ошибки маркера прочтения, чтобы не прерывать UX
        }
    }
}

export default TextChatManager;
