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

      if (isPrivateRoom) {
        client.currentServerId = serverId;
        client.currentServer = server || null;
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
        await this.renderRooms(client, [privateRoom]);
        await this.joinRoom(client, serverId, false);
        return;
      }

      client.currentServerId = serverId;
      client.currentServer = server || null;
      const res = await fetch(`${client.API_SERVER_URL}/api/servers/${serverId}/rooms`, {
        headers: {
          'Authorization': `Bearer ${client.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`Не удалось загрузить гнёзда: ${errorData.error || res.statusText}`);
      }

      const data = await res.json();
      if (!data || !Array.isArray(data.rooms)) {
        throw new Error('Некорректные данные от сервера');
      }

      client.rooms = data.rooms;
      await this.cacheRoomUsernames(client, data.rooms);
      this.renderRooms(client, data.rooms);
    } catch (error) {
      UIManager.updateStatus('Ошибка загрузки гнёзд', 'error');
      UIManager.showError('Не удалось загрузить гнёзда: ' + error.message);
    }
  }

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
      if (result && client.currentRoom && client.socket) {
        const room = client.rooms.find(r => r.id === roomId);
        const roomName = room ? room.name : roomId;
      }
      return result;
    } catch (error) {
      UIManager.showError('Не удалось занять гнездо: ' + error.message);
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
      return true;
    } catch (error) {
      UIManager.showError('Ошибка при покидании гнезда: ' + error.message);
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
        const errorMessage = errorData.error || 'Не удалось свить гнездо';
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
      UIManager.addMessage('System', `✅ Гнездо "${name}" свито`);
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  }

  static async createRoomInvite(client, roomId) {
    try {
      const invite = await InviteManager.createRoomInvite(roomId);
      if (invite) {
        const inviteLink = InviteManager.generateInviteLink(invite.code);
        UIManager.openModal('Приглашение создано', `
          <p>Приглашение для гнезда создано!</p>
          <div class="invite-link-container">
            <input type="text" id="inviteLinkInput" value="${inviteLink}" readonly>
            <button onclick="navigator.clipboard.writeText('${inviteLink}').then(() => alert('Ссылка скопирована!'))">Копировать</button>
          </div>
          <p>Ссылка действительна до: ${new Date(invite.expiresAt).toLocaleDateString()}</p>
        `, () => {
          UIManager.closeModal();
        });
      } else {
        UIManager.showError('Не удалось создать приглашение: пустой ответ');
      }
    } catch (error) {
      UIManager.showError('Не удалось создать приглашение: ' + error.message);
    }
  }

  static async copyRoomInviteLink(client, roomId) {
    try {
      const invites = await InviteManager.getRoomInvites(roomId);
      if (invites && invites.length > 0) {
        const activeInvite = invites.find(invite => new Date(invite.expiresAt) > new Date());
        if (activeInvite) {
          InviteManager.copyInviteLink(activeInvite.code);
          return;
        }
      }
      const invite = await InviteManager.createRoomInvite(roomId);
      if (invite) {
        InviteManager.copyInviteLink(invite.code);
      }
    } catch (error) {
      UIManager.showError('Не удалось скопировать ссылку приглашения');
    }
  }

  static async deleteRoom(client, roomId) {
    if (!confirm('Вы уверены, что хотите разорить это гнездо?')) return;
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
        throw new Error(errorData.error || 'Не удалось разорить гнездо');
      }

      if (client.currentServerId) {
        await this.loadRoomsForServer(client, client.currentServerId);
      }
      if (client.currentRoom === roomId) {
        await this.leaveRoom(client);
      }
      UIManager.addMessage('System', '✅ Гнездо разорено');
    } catch (error) {
      UIManager.showError('Ошибка: ' + error.message);
    }
  }

  static async reconnectToRoom(client, roomId) {
    try {
      const result = await client.reconnectToRoom(roomId);
      return result;
    } catch (error) {
      UIManager.showError('Ошибка переподключения: ' + error.message);
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

    if (server?.participantIds && Array.isArray(server.participantIds)) {
      otherUserId = server.participantIds.find(id => id !== currentUserId);
    }
    if (!otherUserId && server?.members && Array.isArray(server.members)) {
      otherUserId = server.members.find(id => id !== currentUserId);
    }
    if (!otherUserId) {
      const parts = roomId.split('_user_');
      if (parts.length === 2) {
        otherUserId = currentUserId === parts[0] ? parts[1] : parts[0];
        if (!otherUserId.startsWith('user_')) {
          otherUserId = 'user_' + otherUserId;
        }
      }
    }

    if (otherUserId) {
      const cachedName = UIManager.usernameCache.get(otherUserId);
      if (cachedName) return cachedName;
      const username = await UIManager.fetchUsername(otherUserId);
      return username;
    }
    return null;
  }

  static getPrivateRoomParticipants(roomId) {
    if (!this.isPrivateRoom(roomId)) return [null, null];
    const parts = roomId.split('_user_');
    if (parts.length === 2) {
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
        throw new Error('Не удалось загрузить приватное гнездо');
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
      UIManager.showError('Не удалось загрузить приватное гнездо: ' + error.message);
      return null;
    }
  }

  static async renderRooms(client, rooms) {
    const roomsList = document.querySelector('.rooms-list');
    if (!roomsList) return;
    roomsList.innerHTML = '';

    for (const room of rooms) {
      const roomElement = document.createElement('div');
      roomElement.className = 'room-item';
      roomElement.dataset.room = room.id;

      const isOwner = room.ownerId === client.userId;
      const isMember = client.currentServer?.members?.includes(client.userId);
      const isPrivate = this.isPrivateRoom(room.id);
      let displayName = room.name;

      if (isPrivate) {
        const cachedName = await this.getPrivateRoomDisplayName(room.id, client.userId, client.currentServer);
        if (cachedName) {
          displayName = cachedName;
        }
      }

      roomElement.innerHTML = `🔊 ${displayName} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''}`;
      roomElement.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (client.currentRoom === room.id) return;

        try {
          const unlockAudio = new Audio('/sounds/room-join.mp3');
          unlockAudio.volume = 0.6;
          await unlockAudio.play();
        } catch (err) {
          // Ignored
        }

        try {
          await client.joinRoom(room.id, true);
          localStorage.setItem('lastRoomId', room.id);
          localStorage.setItem('lastServerId', client.currentServerId);
        } catch (error) {
          UIManager.showError('Не удалось занять гнездо: ' + error.message);
        }
      });

      if (isMember || isPrivate) {
        const actionButtons = document.createElement('div');
        actionButtons.className = 'room-actions';

        const shareBtn = document.createElement('button');
        shareBtn.className = 'room-action-btn';
        shareBtn.innerHTML = '📋';
        shareBtn.title = 'Скопировать ссылку на гнездо';
        shareBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const invite = await InviteManager.createRoomInvite(room.id);
            const inviteLink = InviteManager.generateInviteLink(invite.code);
            await navigator.clipboard.writeText(inviteLink);
            UIManager.showError('Ссылка скопирована!');
          } catch (error) {
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
            this.createRoomInvite(client, room.id);
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'room-action-btn';
          deleteBtn.innerHTML = '✕';
          deleteBtn.title = 'Разорить гнездо';
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
