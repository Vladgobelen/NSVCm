import UIManager from './UIManager.js';

class TextChatManager {
    static setupSocketHandlers(client) {
        if (!client.socket) return;

        client.socket.on('new-message', (message) => {
            console.log('New message received:', message);
            if (message.roomId === client.currentRoom) {
                // ✅ Передаём messageId и readBy
                UIManager.addMessage(
                    message.username,
                    message.text,
                    message.timestamp,
                    message.type,
                    message.imageUrl,
                    message.id,               // messageId
                    message.readBy || []      // readBy
                );
            }
        });

        client.socket.on('text-message-history', (data) => {
            console.log('Message history received:', data);
            if (data.roomId === client.currentRoom && data.messages) {
                UIManager.clearMessages();
                data.messages.forEach(msg => {
                    // ✅ Передаём messageId и readBy
                    UIManager.addMessage(
                        msg.username,
                        msg.text,
                        msg.timestamp,
                        msg.type,
                        msg.imageUrl,
                        msg.id,                   // messageId
                        msg.readBy || []          // readBy
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
            console.log('Socket connected');
            UIManager.updateStatus('Подключено', 'connected');
            if (client.currentRoom) {
                this.joinTextRoom(client, client.currentRoom);
            }
        });

        client.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            UIManager.updateStatus('Отключено', 'disconnected');
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
                        // ✅ Передаём messageId и readBy
                        UIManager.addMessage(
                            message.username,
                            message.text,
                            message.timestamp,
                            message.type,
                            message.imageUrl,
                            message.id,               // messageId
                            message.readBy || []      // readBy
                        );
                    });
                }
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

static async uploadImage(client, roomId, file) {
    console.group('📤 [DEBUG] TextChatManager.uploadImage START');
    console.log('🎯 Room ID:', roomId);
    console.log('🎯 File object:', file);
    console.log('🎯 File name:', file.name);
    console.log('🎯 File type:', file.type);
    console.log('🎯 File size:', file.size, 'bytes');
    console.log('🎯 Client token (first 10 chars):', client.token?.substring(0, 10) + '...');

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        const error = new Error('Поддерживаются только JPEG, PNG и WebP');
        console.error('❌ MIME type not supported:', file.type);
        console.groupEnd();
        throw error;
    }
    if (file.size > 50 * 1024 * 1024) {
        const error = new Error('Файл слишком большой (макс. 5 МБ)');
        console.error('❌ File too large');
        console.groupEnd();
        throw error;
    }

    const formData = new FormData();
    formData.append('image', file);

    // 🔍 Проверим, что файл действительно в FormData
    for (let [key, value] of formData.entries()) {
        console.log('📦 FormData entry:', key, '=>', value);
    }

    const url = `${client.API_SERVER_URL}/api/messages/upload-image/${roomId}`;
    console.log('📡 Fetch URL:', url);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${client.token}`
                // ⚠️ НЕ указываем Content-Type — браузер сам поставит boundary
            },
            body: formData
        });

        console.log('📨 Response status:', response.status);
        console.log('📨 Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
                console.log('💥 Server error response body:', errorData);
            } catch (e) {
                console.warn('⚠️ Could not parse error response as JSON');
                const text = await response.text();
                console.log('💥 Raw error response body:', text);
                errorData = { error: 'Неизвестная ошибка сервера' };
            }
            const error = new Error(errorData.error || 'Ошибка загрузки изображения');
            console.error('❌ Upload failed:', error.message);
            console.groupEnd();
            throw error;
        }

        const result = await response.json();
        console.log('✅ Upload success. Response:', result);
        console.groupEnd();
        return result.imageUrl;

    } catch (fetchError) {
        console.error('🔥 Fetch threw an exception:', fetchError);
        console.groupEnd();
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
                console.warn('Failed to mark messages as read');
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }

    static async sendMessage(client, content, type = 'text') {
        if (!client.currentRoom) return;

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
