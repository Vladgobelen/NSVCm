// modules/TextChatManager.js
import UIManager from './UIManager.js';

class TextChatManager {
    static setupSocketHandlers(client) {
        if (!client.socket) return;

        client.socket.on('text-message-history', (data) => {
            if (data.roomId === client.currentRoom && data.messages) {
                UIManager.clearMessages();
                data.messages.forEach(msg => {
                    UIManager.addMessage(
                        msg.username,
                        msg.text,
                        msg.timestamp,
                        msg.type,
                        msg.imageUrl,
                        msg.id,
                        msg.readBy || [],
                        msg.userId
                    );
                });
            }
        });

        client.socket.on('messages-read', (data) => {
            if (data.messageIds && Array.isArray(data.messageIds)) {
                data.messageIds.forEach(id => {
                    UIManager.updateMessageReadStatus(id, data.readerId, data.readerName);
                });
            }
        });

        client.socket.on('connect', () => {
            UIManager.updateStatus('Подключено', 'connected');
            if (client.currentRoom) {
                this.joinTextRoom(client, client.currentRoom);
            }
        });

        client.socket.on('disconnect', (reason) => {
            UIManager.updateStatus('Отключено', 'disconnected');
        });

        // 🔥 ОБРАБОТЧИК НЕПРОЧИТАННЫХ СООБЩЕНИЙ
        client.socket.on('unread-update', (data) => {
            console.log('📬 [CLIENT] Получено обновление непрочитанных:', data);
            UIManager.setUnreadCount(
                data.serverId,
                data.count,
                data.hasMention,
                data.personalCount || 0
            );
        });
    }

    static joinTextRoom(client, roomId) {
        if (client.socket) {
            client.socket.emit('join-text-room', { roomId });
        }
    }

    static leaveTextRoom(client, roomId) {
        if (client.socket) {
            client.socket.emit('leave-text-room', { roomId });
        }
    }

    static async loadMoreMessages(client, roomId, beforeMessageId) {
        return this.loadMessages(client, roomId, 50, beforeMessageId);
    }

    static async loadMessages(client, roomId, limit = 100, before = null) {
        try {
            const params = new URLSearchParams();
            params.append('limit', limit);
            if (before) params.append('before', before);

            const response = await fetch(`${client.API_SERVER_URL}/api/chat/rooms/${roomId}/messages?${params}`, {
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.messages && Array.isArray(data.messages)) {
                    if (!before) {
                        UIManager.clearMessages();
                    }
                    data.messages.forEach(message => {
                        UIManager.addMessage(
                            message.username,
                            message.text,
                            message.timestamp,
                            message.type,
                            message.imageUrl,
                            message.id,
                            message.readBy || [],
                            message.userId
                        );
                    });
                }
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    static async uploadImage(client, roomId, file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new Error('Поддерживаются только JPEG, PNG и WebP');
        }

        if (file.size > 50 * 1024 * 1024) {
            throw new Error('Файл слишком большой (макс. 5 МБ)');
        }

        const formData = new FormData();
        formData.append('image', file);

        const url = `${client.API_SERVER_URL}/api/messages/upload-image/${roomId}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${client.token}`
                },
                body: formData
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    const text = await response.text();
                    errorData = { error: 'Неизвестная ошибка сервера' };
                }
                throw new Error(errorData.error || 'Ошибка загрузки изображения');
            }

            const result = await response.json();
            return result.imageUrl;
        } catch (fetchError) {
            console.error('Fetch threw an exception:', fetchError);
            throw fetchError;
        }
    }

    static async markMessagesAsRead(client, messageIds) {
        if (!client.currentRoom || !Array.isArray(messageIds) || messageIds.length === 0) return;

        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages/${client.currentRoom}/read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({ messageIds })
            });

            if (!response.ok) {
                console.error('Failed to mark messages as read');
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }

    static async handleDebugCommand(client) {
        if (!client.currentRoom) {
            UIManager.showError('Вы не в комнате');
            return;
        }

        // 🔥 ОТЛАДКА НЕПРОЧИТАННЫХ СООБЩЕНИЙ
        let debugMessage = '🔍 === ОТЛАДКА МАРШРУТОВ И НЕПРОЧИТАННЫХ ===\n\n';

        // Маршруты
        debugMessage += '📡 МАРШРУТЫ:\n';
        debugMessage += `  ClientID: ${client.clientID}\n`;
        debugMessage += `  Комната: ${client.currentRoom}\n`;
        debugMessage += `  Подключен: ${client.isConnected}\n`;
        debugMessage += `  Send Transport: ${client.sendTransport ? client.sendTransport.id : 'нет'}\n`;
        debugMessage += `  Recv Transport: ${client.recvTransport ? client.recvTransport.id : 'нет'}\n`;

        if (client.audioProducer) {
            debugMessage += `\n🎤 Продюсер: ${client.audioProducer.id}\n`;
        }

        debugMessage += `\n🎧 Консьюмеры (${client.consumerState?.size || 0}):\n`;
        if (client.consumerState && client.consumerState.size > 0) {
            client.consumerState.forEach((state, producerId) => {
                debugMessage += `  ${producerId}: ${state.status}\n`;
            });
        } else {
            debugMessage += `  (нет)\n`;
        }

        // 🔥 НЕПРОЧИТАННЫЕ СООБЩЕНИЯ
        debugMessage += '\n📬 НЕПРОЧИТАННЫЕ СООБЩЕНИЯ:\n';
        if (UIManager.unreadCounts && Object.keys(UIManager.unreadCounts).length > 0) {
            let totalUnread = 0;
            let totalPersonal = 0;
            for (const [serverId, data] of Object.entries(UIManager.unreadCounts)) {
                totalUnread += data.count || 0;
                totalPersonal += data.personalCount || 0;
                debugMessage += `  Сервер ${serverId}: ${data.count} сообщений`;
                if (data.hasMention) debugMessage += ' (есть упоминание)';
                if (data.personalCount > 0) debugMessage += ` (${data.personalCount} персональных)`;
                debugMessage += '\n';
            }
            debugMessage += `  Итого: ${totalUnread} непрочитанных (${totalPersonal} персональных)\n`;
        } else {
            debugMessage += `  (нет непрочитанных на клиенте)\n`;
        }

        // 🔥 ЗАПРОС К СЕРВЕРУ О НЕПРОЧИТАННЫХ
        debugMessage += '\n🔍 ЗАПРОС К СЕРВЕРУ:\n';
        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages/unread`, {
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const serverData = await response.json();
                debugMessage += `  Статус: OK\n`;
                debugMessage += `  Данные с сервера: ${JSON.stringify(serverData, null, 2)}\n`;
            } else {
                debugMessage += `  Статус: ERROR ${response.status}\n`;
            }
        } catch (error) {
            debugMessage += `  Ошибка запроса: ${error.message}\n`;
        }

        debugMessage += '\n=================================';

        UIManager.addMessage(
            'System (Debug)',
            debugMessage,
            new Date().toISOString(),
            'system',
            null,
            `debug_local_${Date.now()}`,
            [],
            'system'
        );

        console.log('🔍 [CLIENT DEBUG]', debugMessage);
    }

    static async getLocalDebugInfo(client) {
        const info = {
            clientID: client.clientID,
            currentRoom: client.currentRoom,
            isConnected: client.isConnected,
            producers: [],
            consumers: [],
            transports: {
                send: client.sendTransport ? client.sendTransport.id : null,
                recv: client.recvTransport ? client.recvTransport.id : null
            }
        };

        if (client.audioProducer) {
            info.producers.push({
                id: client.audioProducer.id,
                kind: 'audio',
                track: client.audioProducer.track ? 'active' : 'closed'
            });
        }

        if (client.consumers) {
            client.consumers.forEach((consumer, producerId) => {
                info.consumers.push({
                    producerId: producerId,
                    consumerId: consumer.id,
                    kind: consumer.kind,
                    closed: consumer.closed || false
                });
            });
        }

        if (window.producerUserMap) {
            info.producerUserMap = Array.from(window.producerUserMap.entries());
        }

        if (window.producerClientMap) {
            info.producerClientMap = Array.from(window.producerClientMap.entries());
        }

        return info;
    }

    static displayLocalDebugInfo(client, debugInfo) {
        let debugMessage = '\n🔍  === ЛОКАЛЬНАЯ ОТЛАДКА (КЛИЕНТ) ===\n';
        debugMessage += `👤 ClientID: ${debugInfo.clientID}\n`;
        debugMessage += `🏠 Комната: ${debugInfo.currentRoom}\n`;
        debugMessage += `🔗 Подключен: ${debugInfo.isConnected}\n`;
        debugMessage += `🚚 Транспорты:\n`;
        debugMessage += `  Send: ${debugInfo.transports.send || 'нет'}\n`;
        debugMessage += `  Recv: ${debugInfo.transports.recv || 'нет'}\n`;
        debugMessage += `🎤 Продюсеры (${debugInfo.producers.length}):\n`;

        if (debugInfo.producers.length === 0) {
            debugMessage += `  (нет)\n`;
        } else {
            debugInfo.producers.forEach((p, i) => {
                debugMessage += `  ${i + 1}. ${p.id} [${p.kind}] - ${p.track}\n`;
            });
        }

        debugMessage += `\n🎧 Консьюмеры (${debugInfo.consumers.length}):\n`;

        if (debugInfo.consumers.length === 0) {
            debugMessage += `  (нет)\n`;
        } else {
            debugInfo.consumers.forEach((c, i) => {
                debugMessage += `  ${i + 1}. ${c.consumerId} <- ${c.producerId} [${c.kind}] ${c.closed ? '(закрыт)' : ''}\n`;
            });
        }

        if (debugInfo.producerUserMap && debugInfo.producerUserMap.length > 0) {
            debugMessage += `\n📋 Producer → User маппинг:\n`;
            debugInfo.producerUserMap.forEach(([producerId, userId]) => {
                debugMessage += `  ${producerId} → ${userId}\n`;
            });
        }

        if (debugInfo.producerClientMap && debugInfo.producerClientMap.length > 0) {
            debugMessage += `\n📋 Producer → Client маппинг:\n`;
            debugInfo.producerClientMap.forEach(([producerId, clientId]) => {
                debugMessage += `  ${producerId} → ${clientId}\n`;
            });
        }

        debugMessage += '\n=================================';

        UIManager.addMessage(
            'System (Local)',
            debugMessage,
            new Date().toISOString(),
            'system',
            null,
            `debug_local_${Date.now()}`,
            [],
            'system'
        );
    }

    static async sendMessage(client, content, type = 'text') {
        if (!client.currentRoom) return;

        if (type === 'text' && content && content.trim() === '-отладка') {
            await this.handleDebugCommand(client);
            return;
        }

        let payload;

        if (type === 'text') {
            if (!content?.trim()) return;
            payload = {
                roomId: client.currentRoom,
                type: 'text',
                text: content.trim()
            };
        } else if (type === 'image') {
            if (!content) throw new Error('imageUrl required for image message');
            payload = {
                roomId: client.currentRoom,
                type: 'image',
                imageUrl: content
            };
        } else {
            throw new Error('Unsupported message type');
        }

        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ошибка отправки сообщения');
            }

            const data = await response.json();
            return data.message;
        } catch (error) {
            UIManager.showError('Не удалось отправить сообщение');
            throw error;
        }
    }
}

export default TextChatManager;
