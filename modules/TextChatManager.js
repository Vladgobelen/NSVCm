import UIManager from './UIManager.js';
import MembersManager from './MembersManager.js';

class TextChatManager {
    static sseConnections = new Map();

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
                    // Очищаем текущие сообщения перед загрузкой новых
                    if (!before) {
                        UIManager.clearMessages();
                    }
                    
                    data.messages.forEach(message => {
                        UIManager.addMessage(message.username, message.text, message.timestamp);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    static async sendMessage(client, text) {
        if (!text.trim() || !client.currentRoom) return;

        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/chat/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    roomId: client.currentRoom,
                    text: text.trim()
                })
            });

            if (!response.ok) {
                throw new Error('Ошибка отправки сообщения');
            }
            
            const data = await response.json();
            return data.message;
        } catch (error) {
            UIManager.showError('Не удалось отправить сообщение');
            throw error;
        }
    }

    static setupSSEConnection(client, roomId) {
        // Закрываем предыдущее соединение, если оно есть
        this.closeSSEConnection(client);
        
        try {
            const eventSource = new EventSource(`${client.API_SERVER_URL}/api/chat/rooms/${roomId}/events?token=${client.token}`);
            
            eventSource.onmessage = (event) => {
                try {
                    // Пропускаем ping-сообщения
                    if (event.data.trim() === ': ping') {
                        return;
                    }
                    
                    // Пропускаем connected-сообщения
                    if (event.data.trim() === ': connected') {
                        return;
                    }
                    
                    const data = JSON.parse(event.data);
                    
                    switch (data.type) {
                        case 'message-history':
                            if (data.messages && Array.isArray(data.messages)) {
                                UIManager.clearMessages();
                                data.messages.forEach(msg => {
                                    UIManager.addMessage(msg.username, msg.text, msg.timestamp);
                                });
                            }
                            break;
                            
                        case 'new-message':
                            if (data.message) {
                                UIManager.addMessage(data.message.username, data.message.text, data.message.timestamp);
                            }
                            break;
                            
                        case 'members-list':
                            if (data.members && Array.isArray(data.members)) {
                                // Обрабатываем список участников
                                MembersManager.updateAllMembers(data.members);
                            }
                            break;
                            
                        case 'member-joined':
                            if (data.member) {
                                MembersManager.addMember({
                                    clientId: `sse_${data.member.userId}`,
                                    username: data.member.username,
                                    isMicActive: data.member.isMicActive || false
                                });
                                
                                // Показываем системное сообщение о присоединении пользователя
                                UIManager.addMessage('System', `Пользователь ${data.member.username} присоединился к чату`, data.timestamp);
                            }
                            break;
                            
                        case 'member-left':
                            if (data.userId) {
                                const clientId = `sse_${data.userId}`;
                                MembersManager.removeMember(clientId);
                                
                                // Показываем системное сообщение о выходе пользователя
                                UIManager.addMessage('System', `Пользователь покинул чат`, data.timestamp);
                            }
                            break;
                            
                        case 'member-mic-state':
                            if (data.userId && typeof data.isActive !== 'undefined') {
                                const clientId = `sse_${data.userId}`;
                                MembersManager.updateMemberMicState(clientId, data.isActive);
                            }
                            break;
                            
                        case 'user-joined':
                            UIManager.addMessage('System', `Пользователь ${data.username} присоединился к чату`, data.timestamp);
                            break;
                            
                        case 'user-left':
                            UIManager.addMessage('System', `Пользователь ${data.username} покинул чат`, data.timestamp);
                            break;
                            
                        case 'chat-cleared':
                            UIManager.addMessage('System', `Чат был очищен пользователем ${data.clearedBy}`, data.timestamp);
                            UIManager.clearMessages();
                            break;
                            
                        default:
                            console.log('Unknown SSE event type:', data.type);
                    }
                } catch (error) {
                    console.error('Error processing SSE message:', error);
                }
            };
            
            eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                
                // Не показываем ошибку пользователю, если это обычное закрытие соединения
                if (eventSource.readyState === EventSource.CLOSED) {
                    console.log('SSE connection closed normally');
                    return;
                }
                
                // Попытка переподключения через 5 секунд
                setTimeout(() => {
                    if (client.currentRoom === roomId) {
                        this.setupSSEConnection(client, roomId);
                    }
                }, 5000);
            };
            
            eventSource.onopen = () => {
                console.log('SSE connection established for room:', roomId);
                UIManager.updateStatus('Чат подключен', 'connected');
            };
            
            // Сохраняем соединение для последующего закрытия
            this.sseConnections.set(client.clientID, eventSource);
            client.sseConnection = eventSource;
            
        } catch (error) {
            console.error('Error creating SSE connection:', error);
            // Не показываем ошибку пользователю, пробуем переподключиться
            setTimeout(() => {
                if (client.currentRoom === roomId) {
                    this.setupSSEConnection(client, roomId);
                }
            }, 5000);
        }
    }

    static closeSSEConnection(client) {
        if (client.sseConnection) {
            client.sseConnection.close();
            client.sseConnection = null;
        }
        
        const connection = this.sseConnections.get(client.clientID);
        if (connection) {
            connection.close();
            this.sseConnections.delete(client.clientID);
        }
    }

    static setupSocketHandlers(client) {
        if (!client.socket) return;

        // Обработчик новых сообщений через сокеты (оставляем для обратной совместимости)
        client.socket.on('new-text-message', (message) => {
            console.log('New message received:', message);
            // Проверяем, что сообщение предназначено для текущей комнаты
            if (message.roomId === client.currentRoom) {
                UIManager.addMessage(message.username, message.text, message.timestamp);
            }
        });

        // Обработчик истории сообщений через сокеты (оставляем для обратной совместимости)
        client.socket.on('text-message-history', (data) => {
            console.log('Message history received:', data);
            if (data.roomId === client.currentRoom && data.messages) {
                UIManager.clearMessages();
                
                data.messages.forEach(msg => {
                    UIManager.addMessage(msg.username, msg.text, msg.timestamp);
                });
            }
        });

        // Обработчики для участников через сокеты
        client.socket.on('member-joined', (data) => {
            MembersManager.addMember(data);
        });

        client.socket.on('member-left', (data) => {
            MembersManager.removeMember(data.clientId);
        });

        client.socket.on('member-mic-state', (data) => {
            MembersManager.updateMemberMicState(data.clientId, data.isActive);
        });

        client.socket.on('members-list', (members) => {
            MembersManager.updateAllMembers(members);
        });

        // Обработчик ошибок
        client.socket.on('error', (error) => {
            console.error('Socket error:', error);
            UIManager.showError('Ошибка соединения: ' + (error.message || 'неизвестная ошибка'));
        });

        // Обработчик подключения
        client.socket.on('connect', () => {
            console.log('Socket connected');
            UIManager.updateStatus('Подключено', 'connected');
            
            // При переподключении присоединяемся к текстовой комнате
            if (client.currentRoom) {
                this.setupSSEConnection(client, client.currentRoom);
            }
        });

        // Обработчик отключения
        client.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            UIManager.updateStatus('Отключено', 'disconnected');
        });
    }

    static joinTextRoom(client, roomId) {
        // Используем SSE вместо WebSocket для текстового чата
        this.setupSSEConnection(client, roomId);
        
        // Оставляем WebSocket соединение для обратной совместимости
        if (client.socket) {
            console.log('Joining text room via WebSocket (fallback):', roomId);
            client.socket.emit('join-text-room', { roomId });
        }
    }

    static leaveTextRoom(client, roomId) {
        // Закрываем SSE соединение
        this.closeSSEConnection(client);
        
        // Оставляем WebSocket для обратной совместимости
        if (client.socket) {
            console.log('Leaving text room via WebSocket (fallback):', roomId);
            client.socket.emit('leave-text-room', { roomId });
        }
    }

    static async loadMoreMessages(client, roomId, beforeMessageId) {
        return this.loadMessages(client, roomId, 50, beforeMessageId);
    }
}

export default TextChatManager;
