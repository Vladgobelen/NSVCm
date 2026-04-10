import MessageRenderer from './MessageRenderer.js';
import UIManager from './UIManager.js';

class TextChatManager {
  static setupSocketHandlers(client) {
    if (!client.socket) return;
    client.socket.on('connect', () => {
      UIManager.updateStatus('Подключено', 'connected');
    });
    client.socket.on('disconnect', () => {
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

  static loadMoreMessages(client, roomId, beforeMessageId) {
    return this.loadMessages(client, roomId, 50, beforeMessageId);
  }

static loadMessages(client, roomId, limit = 100, beforeId = null, targetContainer = null) {
    return new Promise((resolve, reject) => {
        if (!client.socket?.connected) {
            return reject(new Error('WebSocket не подключен'));
        }
        
        client.socket.emit('request-message-history', { roomId, limit, beforeId }, async (response) => {
            if (response?.success && Array.isArray(response.messages)) {
                // 🔥 ДОБАВИТЬ ЛОГ
                console.log(`[TextChatManager] Получено ${response.messages.length} сообщений от сервера`);
                
                if (response.messages.length > 0) {
                    const container = targetContainer || document.querySelector('.messages-container');
                    
                    if (beforeId && container) {
                        await MessageRenderer.prependMessagesBatch(response.messages);
                    } else {
                        for (const msg of response.messages) {
                            UIManager.addMessage(
                                msg.username, msg.text, msg.timestamp, msg.type, msg.imageUrl, msg.id,
                                msg.readBy || [], msg.userId, false, msg.thumbnailUrl, container, msg.replyTo, msg.reactions || {}
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

static loadMessagesAround(client, roomId, messageId, limit = 50, targetContainer = null) {
    return new Promise((resolve, reject) => {
        if (!client.socket?.connected) return reject(new Error('WebSocket не подключен'));
        
        console.log(`[TextChatManager] loadMessagesAround: roomId=${roomId}, messageId=${messageId}, limit=${limit}`);
        
        client.socket.emit('request-message-history', { roomId, limit, aroundId: messageId }, (response) => {
            if (response?.success && Array.isArray(response.messages)) {
                console.log(`[TextChatManager] loadMessagesAround: получено ${response.messages.length} сообщений`);
                
                const container = targetContainer || document.querySelector('.messages-container');
                if (container) {
                    // 🔥 ВАЖНО: Собираем ID существующих сообщений
                    const existingIds = new Set();
                    container.querySelectorAll('.message[data-message-id]').forEach(el => {
                        existingIds.add(el.dataset.messageId);
                    });
                    
                    // 🔥 Фильтруем дубликаты
                    const newMessages = response.messages.filter(msg => !existingIds.has(msg.id));
                    console.log(`[TextChatManager] loadMessagesAround: ${newMessages.length} новых сообщений (${response.messages.length - newMessages.length} дубликатов)`);
                    
                    if (newMessages.length > 0) {
                        // 🔥 Очищаем контейнер и добавляем ТОЛЬКО НОВЫЕ сообщения
                        // Не очищаем полностью, а добавляем новые в правильном порядке
                        const fragment = document.createDocumentFragment();
                        
                        for (const msg of newMessages) {
                            const el = MessageRenderer._createMessageElement(
                                msg.username, msg.text, msg.timestamp, msg.type,
                                msg.imageUrl, msg.id, msg.readBy || [], msg.userId, 
                                false, msg.thumbnailUrl, msg.replyTo, msg.reactions || {}
                            );
                            if (el) {
                                el.classList.add('appeared');
                                fragment.appendChild(el);
                            }
                        }
                        
                        // 🔥 Добавляем в начало контейнера (перед sentinel)
                        const sentinel = container.querySelector('.history-sentinel');
                        if (sentinel) {
                            sentinel.after(fragment);
                        } else {
                            container.prepend(fragment);
                        }
                    }
                }
                
                resolve({ 
                    messages: response.messages, 
                    hasMore: response.hasMore, 
                    isAroundMode: response.isAroundMode,
                    targetIndex: response.targetIndex,
                    hasMoreBefore: response.hasMoreBefore,
                    hasMoreAfter: response.hasMoreAfter
                });
            } else {
                reject(new Error(response?.error || 'Не удалось загрузить сообщения'));
            }
        });
    });
}
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
        headers: { Authorization: `Bearer ${client.token}` },
        body: formData
      });
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: 'Ошибка сервера' };
        }
        throw new Error(errorData.error || 'Ошибка загрузки изображения');
      }
      const result = await response.json();
      return { imageUrl: result.imageUrl, thumbnailUrl: result.thumbnailUrl };
    } catch (fetchError) {
      throw fetchError;
    }
  }

  static async sendMessage(client, content, type = 'text', replyTo = null) {
    if (!client.currentRoom) return;
    let payload;
    if (type === 'text') {
      if (!content?.trim()) return;
      payload = { roomId: client.currentRoom, type: 'text', text: content.trim(), replyTo };
    } else if (type === 'image') {
      if (!content?.imageUrl) throw new Error('imageUrl required');
      payload = { roomId: client.currentRoom, type: 'image', imageUrl: content.imageUrl, thumbnailUrl: content.thumbnailUrl, replyTo };
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
      UIManager.showError('Не удалось отправить сообщение');
      throw error;
    }
  }

  static async sendMessageToRoom(client, roomId, content, type = 'text', replyTo = null) {
    if (!roomId || !content?.trim() || !client?.token) {
      throw new Error('Missing roomId, content or token');
    }
    let payload;
    if (type === 'text') {
      payload = { roomId, type: 'text', text: content.trim(), replyTo };
    } else if (type === 'image') {
      if (!content?.imageUrl) throw new Error('imageUrl required');
      payload = { roomId, type: 'image', imageUrl: content.imageUrl, thumbnailUrl: content.thumbnailUrl, replyTo };
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

  static async markMessagesAsRead(client, roomId, lastViewedMessageId) {
    if (!roomId || !client?.token) return;
    const isPrivate = roomId.startsWith('user_') && roomId.includes('_user_');
    const serverId = isPrivate ? roomId : (client.currentServerId || roomId);
    try {
      const response = await fetch(`${client.API_SERVER_URL}/api/messages/${roomId}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.token}` },
        body: JSON.stringify({ serverId, lastViewedMessageId })
      });
      if (!response.ok) {
        console.error(`Ошибка mark-read: статус ${response.status} для ${roomId}`);
      }
    } catch (error) {
      console.error(`Исключение при mark-read:`, error.message);
    }
  }
}

export default TextChatManager;
