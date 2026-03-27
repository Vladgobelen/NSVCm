// modules/RoomManager.js
import UIManager from './UIManager.js';
import MediaManager from './MediaManager.js';
import TextChatManager from './TextChatManager.js';
import MembersManager from './MembersManager.js';
import InviteManager from './InviteManager.js';
import ServerManager from './ServerManager.js';

class RoomManager {
    static async loadRoomsForServer(client, serverId) {
        try {
            const server = client.servers.find(s => s.id === serverId);
            const isPrivateRoom = ServerManager.isPrivateServer(server);
            console.log('🏠 [LOAD-ROOMS] Загрузка комнат для сервера:', serverId);
            console.log('🏠 [LOAD-ROOMS] Это private room?', isPrivateRoom);
            console.log('🏠 [LOAD-ROOMS] Объект сервера:', server);

            if (isPrivateRoom) {
                client.currentServerId = serverId;
                client.currentServer = server || null;
                UIManager.updateStatus('Подключение к приватному чату...', 'connecting');
                
                // 🔥 ИСПРАВЛЕНО: Сначала кэшируем все имена, потом рендерим
                await this.cachePrivateRoomUsernames(client, server);
                
                const displayName = ServerManager.getPrivateServerDisplayName(server, client.userId);
                const privateRoom = {
                    id: serverId,
                    name: displayName,
                    ownerId: server?.ownerId || client.userId,
                    type: 'private',
                    serverId: serverId,
                    members: server?.members || [client.userId],
                    participantIds: server?.participantIds || server?.members || [client.userId],
                    isPrivate: true
                };
                client.rooms = [privateRoom];
                
                // 🔥 ИСПРАВЛЕНО: Перерендериваем после кэширования имён
                await this.renderRooms(client, [privateRoom]);
                await this.joinRoom(client, serverId, false);
                return;
            }

            client.currentServerId = serverId;
            client.currentServer = server || null;
            UIManager.updateStatus('Загрузка комнат...', 'connecting');

            const res = await fetch(`${client.API_SERVER_URL}/api/servers/${serverId}/rooms`, {
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(`Не удалось загрузить комнаты: ${errorData.error || res.statusText}`);
            }
            const data = await res.json();
            if (!data || !Array.isArray(data.rooms)) {
                throw new Error('Некорректные данные от сервера');
            }
            client.rooms = data.rooms;
            
            // 🔥 ИСПРАВЛЕНО: Кэшируем имена перед рендером
            await this.cacheRoomUsernames(client, data.rooms);
            this.renderRooms(client, data.rooms);
            UIManager.updateStatus('Комнаты загружены', 'normal');
        } catch (error) {
            UIManager.updateStatus('Ошибка загрузки комнат', 'error');
            UIManager.showError('Не удалось загрузить комнаты: ' + error.message);
            console.error(error);
        }
    }

    // 🔥 НОВАЯ ФУНКЦИЯ: Кэширование имён для всех комнат
    static async cacheRoomUsernames(client, rooms) {
        const userIdsToCache = new Set();
        
        for (const room of rooms) {
            if (this.isPrivateRoom(room.id)) {
                const participants = this.getPrivateRoomParticipants(room.id);
                for (const userId of participants) {
                    if (userId && userId !== client.userId && !UIManager.usernameCache.has(userId)) {
                        userIdsToCache.add(userId);
                    }
                }
            }
        }
        
        if (userIdsToCache.size > 0) {
            await UIManager.fetchUsernames(Array.from(userIdsToCache));
        }
    }

    static async cachePrivateRoomUsernames(client, server) {
        const userIdsToCache = [];
        if (server?.participantIds && Array.isArray(server.participantIds)) {
            for (const id of server.participantIds) {
                if (id !== client.userId && !UIManager.usernameCache.has(id)) {
                    userIdsToCache.push(id);
                }
            }
        }
        if (server?.members && Array.isArray(server.members)) {
            for (const id of server.members) {
                if (id !== client.userId && !UIManager.usernameCache.has(id)) {
                    userIdsToCache.push(id);
                }
            }
        }
        if (userIdsToCache.length > 0) {
            await UIManager.fetchUsernames(userIdsToCache);
        }
    }

    static async joinRoom(client, roomId, clearUnread = true) {
        try {
            const result = await client.joinRoom(roomId, clearUnread);
            return result;
        } catch (error) {
            UIManager.showError('Не удалось присоединиться к комнате: ' + error.message);
            console.error(error);
            throw error;
        }
    }

    static async leaveRoom(client) {
        if (!client.currentRoom) return;
        try {
            if (client.socket) {
                client.socket.emit('leave-room', { roomId: client.currentRoom });
            }
            if (client.isConnected) {
                MediaManager.disconnect(client);
            }
            await fetch(`${client.API_SERVER_URL}/api/media/rooms/${client.currentRoom}/leave`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            document.querySelectorAll('.member-volume-slider').forEach(slider => {
                slider.style.display = 'none';
                slider.dataset.producerId = '';
            });
            MembersManager.clearMembers();
            client.currentRoom = null;
            client.roomType = null;
            UIManager.updateRoomUI(client);
            UIManager.addMessage('System', `✅ Вы покинули комнату`);
            return true;
        } catch (error) {
            UIManager.showError('Ошибка при покидании комнаты: ' + error.message);
            console.error(error);
            return false;
        }
    }

    static async createRoom(client, serverId, name) {
        if (!name || name.length < 3) {
            alert('Название должно быть от 3 символов');
            return;
        }
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    name: name.trim(),
                    serverId: serverId,
                    type: 'voice',
                    userId: client.userId,
                    token: client.token
                })
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const errorMessage = errorData.error || 'Не удалось создать комнату';
                if (errorMessage.includes('уже существует')) {
                    alert(`Ошибка: ${errorMessage}. Выберите другое название.`);
                } else {
                    throw new Error(errorMessage);
                }
                return;
            }
            const data = await res.json();
            const roomData = data.room;
            if (client.currentServerId === serverId) {
                await this.loadRoomsForServer(client, serverId);
            }
            UIManager.addMessage('System', `✅ Создана комната "${name}"`);
        } catch (error) {
            alert('Ошибка: ' + error.message);
            console.error(error);
        }
    }

    static async createRoomInvite(client, roomId) {
        try {
            console.log('🏠 [ROOM] Создание приглашения для комнаты:', roomId);
            const invite = await InviteManager.createRoomInvite(roomId);
            console.log('📋 [ROOM] Получено приглашение:', invite);
            if (invite) {
                console.log('✅ [ROOM] Код приглашения:', invite.code);
                const inviteLink = InviteManager.generateInviteLink(invite.code);
                console.log('🔗 [ROOM] Сгенерированная ссылка:', inviteLink);
                UIManager.openModal('Приглашение создано', `
                    <p>Приглашение для комнаты создано!</p>
                    <div class="invite-link-container">
                        <input type="text" id="inviteLinkInput" value="${inviteLink}" readonly>
                        <button onclick="navigator.clipboard.writeText('${inviteLink}').then(() => alert('Ссылка скопирована!'))">Копировать</button>
                    </div>
                    <p>Ссылка действительна до: ${new Date(invite.expiresAt).toLocaleDateString()}</p>
                `, () => {
                    UIManager.closeModal();
                });
            } else {
                console.error('❌ [ROOM] Приглашение не создано (null)');
                UIManager.showError('Не удалось создать приглашение: пустой ответ');
            }
        } catch (error) {
            console.error('❌ [ROOM] Ошибка создания приглашения:', error);
            UIManager.showError('Не удалось создать приглашение: ' + error.message);
        }
    }

    static async copyRoomInviteLink(client, roomId) {
        try {
            console.log('📋 [ROOM-COPY] Копирование ссылки для комнаты:', roomId);
            const invites = await InviteManager.getRoomInvites(roomId);
            console.log('📋 [ROOM-COPY] Существующие приглашения:', invites);
            if (invites && invites.length > 0) {
                const activeInvite = invites.find(invite => new Date(invite.expiresAt) > new Date());
                console.log('📋 [ROOM-COPY] Активное приглашение:', activeInvite);
                if (activeInvite) {
                    console.log('✅ [ROOM-COPY] Код приглашения:', activeInvite.code);
                    InviteManager.copyInviteLink(activeInvite.code);
                    return;
                }
            }
            console.log('🔄 [ROOM-COPY] Создание нового приглашения');
            const invite = await InviteManager.createRoomInvite(roomId);
            console.log('📋 [ROOM-COPY] Получено новое приглашение:', invite);
            if (invite) {
                console.log('✅ [ROOM-COPY] Код приглашения:', invite.code);
                InviteManager.copyInviteLink(invite.code);
            } else {
                console.error('❌ [ROOM-COPY] Приглашение не создано');
            }
        } catch (error) {
            console.error('❌ [ROOM-COPY] Ошибка:', error);
            UIManager.showError('Не удалось скопировать ссылку приглашения');
        }
    }

    static async deleteRoom(client, roomId) {
        if (!confirm('Вы уверены, что хотите удалить эту комнату?')) return;
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/rooms/${roomId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Не удалось удалить комнату');
            }
            if (client.currentServerId) {
                await this.loadRoomsForServer(client, client.currentServerId);
            }
            if (client.currentRoom === roomId) {
                await this.leaveRoom(client);
            }
            UIManager.addMessage('System', `✅ Комната удалена`);
        } catch (error) {
            UIManager.showError('Ошибка: ' + error.message);
            console.error(error);
        }
    }

    static async reconnectToRoom(client, roomId) {
        try {
            const result = await client.reconnectToRoom(roomId);
            return result;
        } catch (error) {
            UIManager.showError('Ошибка переподключения: ' + error.message);
            console.error(error);
            throw error;
        }
    }

    static isPrivateRoom(roomId) {
        if (!roomId) return false;
        if (roomId.includes('bot_system')) return true;
        return roomId.startsWith('user_') && roomId.includes('_user_');
    }

static async getPrivateRoomDisplayName(roomId, currentUserId, server) {
    if (!this.isPrivateRoom(roomId)) return null;
    
    let otherUserId = null;
    
    // 🔥 Проверяем participantIds
    if (server?.participantIds && Array.isArray(server.participantIds)) {
        otherUserId = server.participantIds.find(id => id !== currentUserId);
    }
    
    // 🔥 Проверяем members
    if (!otherUserId && server?.members && Array.isArray(server.members)) {
        otherUserId = server.members.find(id => id !== currentUserId);
    }
    
    // 🔥 Парсим из ID комнаты
    if (!otherUserId) {
        const parts = roomId.split('_user_');
        if (parts.length === 2) {
            otherUserId = currentUserId === parts[0] ? parts[1] : parts[0];
            // 🔥 Восстанавливаем префикс user_ если потерялся
            if (!otherUserId.startsWith('user_')) {
                otherUserId = 'user_' + otherUserId;
            }
        }
    }
    
    if (otherUserId) {
        // 🔥 Сначала проверяем кэш
        const cachedName = UIManager.usernameCache.get(otherUserId);
        if (cachedName) {
            return cachedName;
        }
        // 🔥 Загружаем имя
        const username = await UIManager.fetchUsername(otherUserId);
        return username;
    }
    
    return null;
}

static getPrivateRoomParticipants(roomId) {
    if (!this.isPrivateRoom(roomId)) return [null, null];
    
    // 🔥 Правильный парсинг формата user_XXX_user_YYY
    const parts = roomId.split('_user_');
    if (parts.length === 2) {
        // 🔥 Восстанавливаем префикс user_ для второго участника
        const user1 = parts[0];
        const user2 = parts[1].startsWith('user_') ? parts[1] : 'user_' + parts[1];
        return [user1, user2];
    }
    return [null, null];
}

    static async checkPrivateRoomAccess(client, roomId) {
        if (!this.isPrivateRoom(roomId)) return true;
        const [user1, user2] = this.getPrivateRoomParticipants(roomId);
        return client.userId === user1 || client.userId === user2;
    }

    static async loadPrivateRoom(client, roomId) {
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/rooms/${roomId}/info`, {
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) {
                throw new Error('Не удалось загрузить приватную комнату');
            }
            const data = await res.json();
            const room = data.room;
            let server = client.servers.find(s => s.id === room.serverId);
            if (!server) {
                const serverRes = await fetch(`${client.API_SERVER_URL}/api/servers/${room.serverId}`, {
                    headers: {
                        'Authorization': `Bearer ${client.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (serverRes.ok) {
                    const serverData = await serverRes.json();
                    server = serverData.server;
                    if (!client.servers.some(s => s.id === server.id)) {
                        client.servers.push(server);
                    }
                }
            }
            if (server) {
                client.currentServerId = server.id;
                client.currentServer = server;
                localStorage.setItem('lastServerId', server.id);
                await this.cachePrivateRoomUsernames(client, server);
            }
            client.rooms = [room];
            this.renderRooms(client, [room]);
            return room;
        } catch (error) {
            console.error('❌ [ROOM] Ошибка загрузки приватной комнаты:', error);
            UIManager.showError('Не удалось загрузить приватную комнату: ' + error.message);
            return null;
        }
    }

    static async renderRooms(client, rooms) {
        const roomsList = document.querySelector('.rooms-list');
        if (!roomsList) return;
        roomsList.innerHTML = '';
        console.log('🏠 [ROOM-RENDER] Рендеринг комнат:', rooms);
        console.log('🏠 [ROOM-RENDER] Текущий сервер:', client.currentServer);
        console.log('🏠 [ROOM-RENDER] Members:', client.currentServer?.members);

        for (const room of rooms) {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            roomElement.dataset.room = room.id;
            
            const isOwner = room.ownerId === client.userId;
            const isMember = client.currentServer?.members?.includes(client.userId);
            const isPrivate = this.isPrivateRoom(room.id);
            
            let displayName = room.name;
            
            // 🔥 ИСПРАВЛЕНО: Для приватных комнат всегда используем кэш или загружаем имя
            if (isPrivate) {
                const cachedName = await this.getPrivateRoomDisplayName(room.id, client.userId, client.currentServer);
                if (cachedName) {
                    displayName = cachedName;
                }
            }
            
            console.log(`🔍 [ROOM-RENDER] Комната ${room.id}:`, {
                isOwner,
                isMember,
                isPrivate,
                displayName,
                serverMembers: client.currentServer?.members,
                serverType: client.currentServer?.type,
                roomId: room.id
            });
            
            roomElement.innerHTML = `🔊 ${displayName} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''}`;
            
            roomElement.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (client.currentRoom === room.id) {
                    return;
                }
                try {
                    const unlockAudio = new Audio('/sounds/room-join.mp3');
                    unlockAudio.volume = 0.5;
                    await unlockAudio.play();
                } catch (err) {
                    // Ignore audio unlock errors
                }
                try {
                    await client.joinRoom(room.id, true);
                    localStorage.setItem('lastRoomId', room.id);
                    localStorage.setItem('lastServerId', client.currentServerId);
                } catch (error) {
                    UIManager.showError('Не удалось присоединиться к комнате: ' + error.message);
                    console.error(error);
                }
            });
            
            if (isMember || isPrivate) {
                console.log(`✅ [ROOM-RENDER] Создаем кнопки для комнаты ${room.id} (isMember=${isMember}, isPrivate=${isPrivate})`);
                const actionButtons = document.createElement('div');
                actionButtons.className = 'room-actions';
                
                const shareBtn = document.createElement('button');
                shareBtn.className = 'room-action-btn';
                shareBtn.innerHTML = '📋';
                shareBtn.title = 'Скопировать ссылку на комнату';
                shareBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        console.log('📋 [SHARE-BTN] Копирование ссылки для комнаты:', room.id);
                        const invite = await InviteManager.createRoomInvite(room.id);
                        console.log('📋 [SHARE-BTN] Получено приглашение:', invite);
                        const inviteLink = InviteManager.generateInviteLink(invite.code);
                        await navigator.clipboard.writeText(inviteLink);
                        UIManager.showError('Ссылка скопирована!');
                    } catch (error) {
                        console.error('❌ [SHARE-BTN] Ошибка:', error);
                        UIManager.showError('Не удалось скопировать ссылку');
                    }
                });
                actionButtons.appendChild(shareBtn);
                
                if (isOwner) {
                    const inviteBtn = document.createElement('button');
                    inviteBtn.className = 'room-action-btn';
                    inviteBtn.title = 'Создать приглашение';
                    inviteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        console.log('🎫 [INVITE-BTN] Создание приглашения для комнаты:', room.id);
                        this.createRoomInvite(client, room.id);
                    });
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'room-action-btn';
                    deleteBtn.innerHTML = '✕';
                    deleteBtn.title = 'Удалить комнату';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteRoom(client, room.id);
                    });
                    actionButtons.appendChild(inviteBtn);
                    actionButtons.appendChild(deleteBtn);
                }
                roomElement.appendChild(actionButtons);
            }
            roomsList.appendChild(roomElement);
        }
    }
}

export default RoomManager;
