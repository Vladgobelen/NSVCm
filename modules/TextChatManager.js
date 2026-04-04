import UIManager from './UIManager.js';

class TextChatManager {
  static setupSocketHandlers(client) {
    if (!client.socket) return;

    client.socket.on('unread-update', (data) => {
      UIManager.setUnreadCount(
        data.serverId, data.roomId, data.count,
        data.hasMention, data.personalCount || 0
      );
    });

    client.socket.on('connect', () => {
      UIManager.updateStatus('Подключено', 'connected');
      if (client.currentRoom) this.joinTextRoom(client, client.currentRoom);
    });

    client.socket.on('disconnect', () => {
      UIManager.updateStatus('Отключено', 'disconnected');
    });

    client.socket.on('new-message', (message) => {
      if (message.roomId === client.currentRoom) {
        UIManager.addMessage(
          message.username, message.text, null, message.type || 'text',
          message.imageUrl, message.id, message.readBy || [],
          message.userId, message.broadcast || false, message.thumbnailUrl
        );
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

  static loadMoreMessages(client, roomId, beforeMessageId) {
    return this.loadMessages(client, roomId, 50, beforeMessageId);
  }

static loadMessages(client, roomId, limit = 100, beforeId = null) {
    return new Promise((resolve, reject) => {
        if (!client.socket?.connected) {
            return reject(new Error('WebSocket не подключен'));
        }
        
        console.log(`📡 [CHAT] Emit: request-message-history | limit: ${limit}, beforeId: ${beforeId || 'null'}`);
        
        client.socket.emit('request-message-history', { roomId, limit, beforeId }, (response) => {
            console.log(`📡 [CHAT] Raw Socket Response:`, response);
            
            if (response?.success && Array.isArray(response.messages)) {
                console.log(`🎨 [UI] Рендеринг ${response.messages.length} сообщений. Режим: ${beforeId ? 'prepend (старые)' : 'clear+append (новые)'}`);
                
                if (!beforeId) UIManager.clearMessages();
                
                if (response.messages.length > 0) {
                    if (beforeId) {
                        UIManager.prependMessagesBatch(response.messages);
                    } else {
                        response.messages.forEach((msg) => {
                            UIManager.addMessage(
                                msg.username, msg.text, msg.timestamp, msg.type,
                                msg.imageUrl, msg.id, msg.readBy || [], msg.userId, false, msg.thumbnailUrl
                            );
                        });
                    }
                }
                resolve({
                    messages: response.messages,
                    hasMore: response.hasMore ?? false
                });
            } else {
                console.error(`❌ [CHAT] Ошибка сокета или невалидный ответ:`, response);
                reject(new Error(response?.error || 'Не удалось загрузить историю'));
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
        try { errorData = await response.json(); } catch { errorData = { error: 'Ошибка сервера' }; }
        throw new Error(errorData.error || 'Ошибка загрузки изображения');
      }

      const result = await response.json();
      return { imageUrl: result.imageUrl, thumbnailUrl: result.thumbnailUrl };
    } catch (fetchError) {
      throw fetchError;
    }
  }

  static async sendMessage(client, content, type = 'text') {
    if (!client.currentRoom) return;

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
      UIManager.showError('Не удалось отправить сообщение');
      throw error;
    }
  }

  static async markMessagesAsRead(client, messageIds) {
    if (!client.currentRoom || !Array.isArray(messageIds) || messageIds.length === 0) return;
    try {
      await fetch(`${client.API_SERVER_URL}/api/messages/${client.currentRoom}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.token}` },
        body: JSON.stringify({ messageIds })
      });
    } catch {
      // Игнорируем ошибки маркера прочтения
    }
  }
}

export default TextChatManager;
