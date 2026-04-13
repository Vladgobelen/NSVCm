// modules/TextChatManager.js
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

  // 🔥 Вспомогательный метод: извлекает первый URL из текста
  static extractFirstUrl(text) {
    if (!text || typeof text !== 'string') return null;
    const urlRegex = /https?:\/\/[^\s<>"'()]+(?:\([^\s<>"'()]*\)[^\s<>"'()]*)*/gi;
    const matches = text.match(urlRegex);
    if (!matches || matches.length === 0) return null;
    return matches[0].replace(/[.,;:!?)\]]+$/, '');
  }

  // 🔥 Вспомогательный метод: запрашивает embed для сообщения
  static fetchEmbedForMessage(client, messageId, url, roomId) {
    if (!client.socket?.connected) {
      console.warn(`⚠️ [TextChatManager] Сокет не подключен, не могу запросить embed`);
      return;
    }
    
    console.log(`🔗 [TextChatManager] Запрос embed для ${messageId}: ${url}`);
    
    client.socket.emit('fetch-message-embed', { 
      messageId, 
      roomId, 
      url 
    });
  }

static loadMessages(client, roomId, limit = 100, beforeId = null, targetContainer = null) {
    return new Promise((resolve, reject) => {
        console.log(`🚀🚀🚀 [TextChatManager] loadMessages вызван: roomId=${roomId}, limit=${limit}, beforeId=${beforeId}`);
        
        if (!client.socket?.connected) {
            console.error('❌ [TextChatManager] Сокет не подключен');
            return reject(new Error('WebSocket не подключен'));
        }
        
        console.log(`📤 [TextChatManager] Отправляем request-message-history...`);
        
        client.socket.emit('request-message-history', { roomId, limit, beforeId }, async (response) => {
            console.log(`📥 [TextChatManager] Получен ответ на request-message-history`);
            console.log(`📥 [TextChatManager] response.success = ${response?.success}`);
            console.log(`📥 [TextChatManager] response.messages.length = ${response?.messages?.length || 0}`);
            console.log(`📥 [TextChatManager] response.hasMore = ${response?.hasMore}`);
            
            if (response?.success && Array.isArray(response.messages)) {
                
                // 🔥 ДЕТАЛЬНЫЙ АНАЛИЗ СООБЩЕНИЙ
                console.log(`\n📊📊📊 [АНАЛИЗ СООБЩЕНИЙ] Всего: ${response.messages.length}`);
                
                const textMessages = response.messages.filter(m => m.type === 'text' || m.type === undefined);
                console.log(`📊 Текстовых сообщений (type=text или undefined): ${textMessages.length}`);
                
                const messagesWithEmbed = response.messages.filter(m => m.embed);
                console.log(`📊 Сообщений с embed: ${messagesWithEmbed.length}`);
                
                const textMessagesWithoutEmbed = textMessages.filter(m => !m.embed);
                console.log(`📊 Текстовых сообщений БЕЗ embed: ${textMessagesWithoutEmbed.length}`);
                
                // 🔥 Показываем примеры
                if (messagesWithEmbed.length > 0) {
                    console.log(`\n✅ ПРИМЕР СООБЩЕНИЯ С EMBED:`);
                    const example = messagesWithEmbed[0];
                    console.log(`  ID: ${example.id}`);
                    console.log(`  Текст: ${example.text?.substring(0, 50)}...`);
                    console.log(`  Embed:`, example.embed);
                }
                
                if (textMessagesWithoutEmbed.length > 0) {
                    console.log(`\n⚠️ ПРИМЕР ТЕКСТОВОГО СООБЩЕНИЯ БЕЗ EMBED:`);
                    const example = textMessagesWithoutEmbed[0];
                    console.log(`  ID: ${example.id}`);
                    console.log(`  Текст: ${example.text?.substring(0, 100)}...`);
                    console.log(`  type: ${example.type}`);
                    console.log(`  embed: ${example.embed}`);
                    
                    // Проверяем, есть ли URL в тексте
                    const url = this.extractFirstUrl(example.text);
                    if (url) {
                        console.log(`  🔗 Найден URL: ${url}`);
                    } else {
                        console.log(`  ❌ URL не найден в тексте`);
                    }
                }
                
                // 🔥 Показываем первые 5 сообщений для детального анализа
                console.log(`\n📋 ПЕРВЫЕ 5 СООБЩЕНИЙ:`);
                response.messages.slice(0, 5).forEach((msg, i) => {
                    console.log(`  ${i+1}. ID: ${msg.id}`);
                    console.log(`     type: ${msg.type}, hasText: ${!!msg.text}, hasEmbed: ${!!msg.embed}`);
                    if (msg.text) {
                        console.log(`     text: ${msg.text.substring(0, 50)}...`);
                    }
                    if (msg.embed) {
                        console.log(`     embed keys: ${Object.keys(msg.embed).join(', ')}`);
                    }
                });
                
                console.log(`\n✅ [TextChatManager] Начинаем рендеринг сообщений...`);
                
                if (response.messages.length > 0) {
                    const container = targetContainer || document.querySelector('.messages-container');
                    
                    if (beforeId && container) {
                        await MessageRenderer.prependMessagesBatch(response.messages);
                    } else {
                        let renderedCount = 0;
                        for (const msg of response.messages) {
                            UIManager.addMessage(
                                msg.username, msg.text, msg.timestamp, msg.type, msg.imageUrl, msg.id,
                                msg.readBy || [], msg.userId, false, msg.thumbnailUrl, container, msg.replyTo,
                                msg.reactions || {}, msg.poll, msg.forwardedFrom, msg.pollRef, msg.embed
                            );
                            renderedCount++;
                        }
                        console.log(`✅ [TextChatManager] Отрендерено ${renderedCount} сообщений`);
                    }
                }
                
                // 🔥 ПРОВЕРЯЕМ СООБЩЕНИЯ БЕЗ EMBED И ЗАПРАШИВАЕМ ПРЕВЬЮ
                if (textMessagesWithoutEmbed.length > 0) {
                    console.log(`\n🔄 [TextChatManager] Проверяем ${textMessagesWithoutEmbed.length} сообщений без embed на наличие URL...`);
                    
                    let urlFoundCount = 0;
                    for (const msg of textMessagesWithoutEmbed) {
                        const url = this.extractFirstUrl(msg.text);
                        if (url) {
                            console.log(`  🔗 Найден URL в ${msg.id}: ${url}`);
                            urlFoundCount++;
                            // Запрашиваем embed
                            this.fetchEmbedForMessage(client, msg.id, url, roomId);
                        }
                    }
                    
                    if (urlFoundCount > 0) {
                        console.log(`🔄 [TextChatManager] Отправлено ${urlFoundCount} запросов на получение embed`);
                    } else {
                        console.log(`ℹ️ [TextChatManager] URL не найдены в сообщениях без embed`);
                    }
                }
                
                resolve({ messages: response.messages, hasMore: response.hasMore ?? false });
            } else {
                console.error('❌ [TextChatManager] Ошибка в ответе:', response?.error);
                reject(new Error(response?.error || 'Не удалось загрузить историю'));
            }
        });
    });
}

// 🔥 Добавь эти методы в класс, если их ещё нет
static extractFirstUrl(text) {
    if (!text || typeof text !== 'string') return null;
    const urlRegex = /https?:\/\/[^\s<>"'()]+(?:\([^\s<>"'()]*\)[^\s<>"'()]*)*/gi;
    const matches = text.match(urlRegex);
    if (!matches || matches.length === 0) return null;
    return matches[0].replace(/[.,;:!?)\]]+$/, '');
}

static fetchEmbedForMessage(client, messageId, url, roomId) {
    if (!client.socket?.connected) {
        console.warn(`⚠️ [TextChatManager] Сокет не подключен, не могу запросить embed`);
        return;
    }
    
    console.log(`📤 [TextChatManager] Запрос embed для ${messageId}: ${url}`);
    
    client.socket.emit('fetch-message-embed', { 
        messageId, 
        roomId, 
        url 
    });
}

  static loadMessagesAround(client, roomId, messageId, limit = 50, targetContainer = null) {
    return new Promise((resolve, reject) => {
        if (!client.socket?.connected) return reject(new Error('WebSocket не подключен'));
        
        client.socket.emit('request-message-history', { roomId, limit, aroundId: messageId }, (response) => {
            if (response?.success && Array.isArray(response.messages)) {
                const container = targetContainer || document.querySelector('.messages-container');
                if (container) {
                    const existingIds = new Set();
                    container.querySelectorAll('.message[data-message-id]').forEach(el => {
                        existingIds.add(el.dataset.messageId);
                    });
                    
                    const newMessages = response.messages.filter(msg => !existingIds.has(msg.id));
                    
                    if (newMessages.length > 0) {
                        const fragment = document.createDocumentFragment();
                        
                        for (const msg of newMessages) {
                            const el = MessageRenderer._createMessageElement(
                                msg.username, msg.text, msg.timestamp, msg.type,
                                msg.imageUrl, msg.id, msg.readBy || [], msg.userId, 
                                false, msg.thumbnailUrl, msg.replyTo, msg.reactions || {},
                                msg.poll, msg.forwardedFrom, msg.pollRef, msg.embed
                            );
                            if (el) {
                                el.classList.add('appeared');
                                fragment.appendChild(el);
                            }
                        }
                        
                        const sentinel = container.querySelector('.history-sentinel');
                        if (sentinel) {
                            sentinel.after(fragment);
                        } else {
                            container.prepend(fragment);
                        }
                    }
                    
                    // 🔥 Проверяем новые сообщения на embed
                    newMessages.forEach(msg => {
                        if (msg.type === 'text' && msg.text && !msg.embed) {
                            const url = this.extractFirstUrl(msg.text);
                            if (url) {
                                setTimeout(() => {
                                    this.fetchEmbedForMessage(client, msg.id, url, roomId);
                                }, 100);
                            }
                        }
                    });
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
