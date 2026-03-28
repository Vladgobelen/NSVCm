// modules/TextChatManager.js
import UIManager from './UIManager.js';

class TextChatManager {
    static setupSocketHandlers(client) {
        if (!client.socket) return;
        
        client.socket.on('unread-update', (data) => {
            console.log('📬 [CLIENT] Получено обновление непрочитанных:', JSON.stringify(data, null, 2));
            UIManager.setUnreadCount(
                data.serverId,
                data.roomId,
                data.count,
                data.hasMention,
                data.personalCount || 0
            );
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
        
        client.socket.on('new-message', (message) => {
            if (message.roomId === client.currentRoom) {
                UIManager.addMessage(
                    message.username,
                    message.text,
                    null,
                    message.type || 'text',
                    message.imageUrl,
                    message.id,
                    message.readBy || [],
                    message.userId,
                    message.broadcast || false,
                    message.thumbnailUrl  // 🔥 НОВЫЙ ПАРАМЕТР
                );
                
                if (message.text &&
                    (message.text.includes('=== ОТЛАДКА МАРШРУТОВ') ||
                    message.text.includes('=== ОТЛАДКА (СЕРВЕР)'))) {
                    console.log('🔍 [CLIENT] Серверная отладка обнаружена, отправляю клиентскую...');
                    setTimeout(() => {
                        client.handleDebugCommand();
                    }, 500);
                }
                
                if (message.type !== 'image' && message.username !== client.username) {
                    client.playSound('message');
                }
            }
        });
    }
    
    static joinTextRoom(client, roomId) {
        if (client.socket) client.socket.emit('join-text-room', { roomId });
    }
    
    static leaveTextRoom(client, roomId) {
        if (client.socket) client.socket.emit('leave-text-room', { roomId });
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
                    if (!before) UIManager.clearMessages();
                    data.messages.forEach(message => {
                        UIManager.addMessage(
                            message.username,
                            message.text,
                            message.timestamp,
                            message.type,
                            message.imageUrl,
                            message.id,
                            message.readBy || [],
                            message.userId,
                            false,
                            message.thumbnailUrl  // 🔥 НОВЫЙ ПАРАМЕТР
                        );
                    });
                }
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }
    
// ============================================================================
// 🔥 ИСПРАВЛЕНО: uploadImage - возвращает объект с двумя URL
// ============================================================================
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
        console.log('✅ [UPLOAD] Изображение загружено:', result);
        
        // 🔥 ВОЗВРАЩАЕМ ОБА URL
        return {
            imageUrl: result.imageUrl,
            thumbnailUrl: result.thumbnailUrl
        };
    } catch (fetchError) {
        console.error('Fetch threw an exception:', fetchError);
        throw fetchError;
    }
}

// ============================================================================
// 🔥 ИСПРАВЛЕНО: sendMessage - поддержка объекта с imageUrl и thumbnailUrl
// ============================================================================
static async sendMessage(client, content, type = 'text') {
    if (!client.currentRoom) return;
    
    if (type === 'text' && content && content.trim() === '-отладка') {
        if (client.socket) {
            client.socket.emit('send-message', {
                roomId: client.currentRoom,
                text: content.trim()
            });
        }
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
        // 🔥 content теперь объект с imageUrl и thumbnailUrl
        if (!content?.imageUrl) throw new Error('imageUrl required for image message');
        payload = {
            roomId: client.currentRoom,
            type: 'image',
            imageUrl: content.imageUrl,
            thumbnailUrl: content.thumbnailUrl
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
    
}

export default TextChatManager;
