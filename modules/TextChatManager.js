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

    static extractFirstUrl(text) {
        if (!text || typeof text !== 'string') return null;
        const urlRegex = /https?:\/\/[^\s<>"'()]+(?:\([^\s<>"'()]*\)[^\s<>"'()]*)*/gi;
        const matches = text.match(urlRegex);
        if (!matches || matches.length === 0) return null;
        return matches[0].replace(/[.,;:!?)\]]+$/, '');
    }

    static fetchEmbedForMessage(client, messageId, url, roomId) {
        if (!client.socket?.connected) return;
        client.socket.emit('fetch-message-embed', { 
            messageId, 
            roomId, 
            url 
        });
    }

static loadMessages(client, roomId, limit = 100, beforeId = null, targetContainer = null) {
    return new Promise((resolve, reject) => {
        if (!client.socket?.connected) {
            return reject(new Error('WebSocket не подключен'));
        }
        client.socket.emit('request-message-history', { roomId, limit, beforeId }, async (response) => {
            if (response?.success && Array.isArray(response.messages)) {
                const textMessages = response.messages.filter(m => m.type === 'text' || m.type === undefined);
                const textMessagesWithoutEmbed = textMessages.filter(m => !m.embed);
                if (response.messages.length > 0) {
                    const container = targetContainer || document.querySelector('.messages-container');
                    if (beforeId && container) {
                        await MessageRenderer.prependMessagesBatch(response.messages);
                    } else {
                        for (const msg of response.messages) {
                            // ✅ ИСПРАВЛЕНИЕ: для аудио используем audioUrl
                            let mediaUrl = null;
                            if (msg.type === 'audio') {
                                mediaUrl = msg.audioUrl;
                            } else if (msg.type === 'image') {
                                mediaUrl = msg.imageUrl;
                            }
                            
                            UIManager.addMessage(
                                msg.username, msg.text, msg.timestamp, msg.type, 
                                mediaUrl, // ← теперь audioUrl для аудио
                                msg.id, msg.readBy || [], msg.userId, false, 
                                msg.thumbnailUrl, container, msg.replyTo,
                                msg.reactions || {}, msg.poll, msg.forwardedFrom, 
                                msg.pollRef, msg.embed
                            );
                        }
                    }
                }
                if (textMessagesWithoutEmbed.length > 0) {
                    for (const msg of textMessagesWithoutEmbed) {
                        const url = this.extractFirstUrl(msg.text);
                        if (url) {
                            this.fetchEmbedForMessage(client, msg.id, url, roomId);
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
        const allowedImageTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/bmp',
            'image/tiff',
            'image/svg+xml',
            'image/heic',
            'image/heif',
            'image/avif'
        ];
        
        if (!allowedImageTypes.includes(file.type)) {
            throw new Error('Поддерживаются только изображения: JPEG, PNG, WebP, GIF, BMP, TIFF, SVG, HEIC, HEIF, AVIF');
        }
        
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('Файл слишком большой (макс. 10 МБ)');
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

    static async uploadAudio(client, roomId, file) {
        const allowedAudioTypes = [
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/ogg',
            'audio/webm',
            'audio/aac',
            'audio/flac',
            'audio/x-m4a',
            'audio/mp4',
            'audio/x-ms-wma',
            'video/webm',
            'audio/webm;codecs=opus',
            'audio/opus',
            'application/ogg',
            'audio/x-flac',
            'audio/x-aac'
        ];
        
        const isAllowed = allowedAudioTypes.some(allowedType => {
            if (allowedType.includes(';')) {
                return file.type === allowedType;
            }
            return file.type === allowedType || file.type.startsWith(allowedType.split(';')[0]);
        });
        
        if (!isAllowed) {
            console.warn('Неподдерживаемый аудио формат:', file.type);
            throw new Error('Неподдерживаемый формат аудио. Разрешены: MP3, WAV, OGG, WEBM, AAC, FLAC, M4A');
        }
        
        if (file.size > 50 * 1024 * 1024) {
            throw new Error('Аудиофайл слишком большой (макс. 50 МБ)');
        }
        
        const formData = new FormData();
        formData.append('audio', file);
        
        const url = `${client.API_SERVER_URL}/api/messages/upload-audio/${roomId}`;
        
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
                throw new Error(errorData.error || 'Ошибка загрузки аудио');
            }
            
            const result = await response.json();
            return { 
                audioUrl: result.audioUrl, 
                filename: result.filename, 
                size: result.size,
                mimetype: result.mimetype
            };
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
        } else if (type === 'audio') {
            if (!content?.audioUrl) throw new Error('audioUrl required');
            payload = { roomId: client.currentRoom, type: 'audio', audioUrl: content.audioUrl, replyTo };
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
        } else if (type === 'audio') {
            if (!content?.audioUrl) throw new Error('audioUrl required');
            payload = { roomId, type: 'audio', audioUrl: content.audioUrl, replyTo };
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

    static async markMessagesAboveAsRead(client, roomId, messageId) {
        if (!roomId || !messageId || !client?.token) return false;
        const isPrivate = roomId.startsWith('user_') && roomId.includes('_user_');
        const serverId = isPrivate ? roomId : (client.currentServerId || roomId);
        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages/${roomId}/mark-above-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.token}` },
                body: JSON.stringify({ messageId, serverId })
            });
            if (!response.ok) {
                console.error(`Ошибка mark-above-read: статус ${response.status}`);
                return false;
            }
            const data = await response.json();
            if (data.success) {
                UIManager.refreshUnreadScan(roomId);
                UIManager.updateScrollButtonCounter(roomId);
            }
            return data.success;
        } catch (error) {
            console.error(`Исключение при mark-above-read:`, error.message);
            return false;
        }
    }

    static async markAllMessagesAsRead(client, roomId) {
        if (!roomId || !client?.token) return false;
        const isPrivate = roomId.startsWith('user_') && roomId.includes('_user_');
        const serverId = isPrivate ? roomId : (client.currentServerId || roomId);
        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages/${roomId}/mark-all-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.token}` },
                body: JSON.stringify({ serverId })
            });
            if (!response.ok) {
                console.error(`Ошибка mark-all-read: статус ${response.status}`);
                return false;
            }
            const data = await response.json();
            if (data.success) {
                UIManager.refreshUnreadScan(roomId);
                UIManager.updateScrollButtonCounter(roomId);
            }
            return data.success;
        } catch (error) {
            console.error(`Исключение при mark-all-read:`, error.message);
            return false;
        }
    }

    static async getClosestMessageId(client, roomId, targetId, direction = 'newer') {
        if (!roomId || !targetId || !client?.token) return null;
        try {
            const response = await fetch(
                `${client.API_SERVER_URL}/api/messages/${roomId}/messages/closest?targetId=${targetId}&direction=${direction}`,
                { headers: { Authorization: `Bearer ${client.token}` } }
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data.closestId || null;
        } catch (error) {
            console.error(`Ошибка getClosestMessageId:`, error.message);
            return null;
        }
    }
}

export default TextChatManager;
