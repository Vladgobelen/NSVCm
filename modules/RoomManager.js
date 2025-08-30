import UIManager from './UIManager.js';
import MediaManager from './MediaManager.js';

class RoomManager {
  static async loadRoomsForServer(client, serverId) {
    try {
      client.currentServerId = serverId;
      client.currentServer = client.servers.find(s => s.id === serverId) || null;
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
      
      UIManager.renderRooms(client, data.rooms);
      UIManager.updateStatus('Комнаты загружены', 'normal');
      
      if (client.currentRoom) {
        const room = data.rooms.find(r => r.id === client.currentRoom);
        if (room && room.type === 'voice') {
          UIManager.updateMicStatus(client.isMicActive);
        }
      }
    } catch (error) {
      UIManager.updateStatus('Ошибка загрузки комнат', 'error');
      UIManager.showError('Не удалось загрузить комнаты: ' + error.message);
    }
  }

  static async joinRoom(client, roomId) {
    try {
      const res = await fetch(`${client.API_SERVER_URL}/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Ошибка присоединения к комнате: ${res.status}`);
      }
      
      const data = await res.json();
      client.currentRoom = roomId;
      client.roomType = data.roomType;
      
      if (client.roomType === 'voice') {
        try {
          await MediaManager.connectToMediaServer(client, roomId);
          UIManager.updateRoomUI(client);
          await MediaManager.startConsumingProducers(client);
        } catch (mediaError) {
          UIManager.showError('Не удалось подключиться к голосовой комнате: ' + mediaError.message);
          throw mediaError;
        }
      } else {
        UIManager.updateRoomUI(client);
      }
      
      UIManager.addMessage('System', `✅ Вы присоединились к комнате`);
      return true;
    } catch (error) {
      UIManager.showError('Не удалось присоединиться к комнате: ' + error.message);
      throw error;
    }
  }

  static async leaveRoom(client) {
    if (!client.currentRoom) return;
    
    try {
      if (client.roomType === 'voice' && client.isConnected) {
        MediaManager.disconnect(client);
      }
      
      await fetch(`${client.API_SERVER_URL}/api/rooms/${client.currentRoom}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      client.currentRoom = null;
      client.roomType = null;
      
      UIManager.updateRoomUI(client);
      UIManager.addMessage('System', `✅ Вы покинули комнату`);
      return true;
    } catch (error) {
      UIManager.showError('Ошибка при покидании комнаты: ' + error.message);
      return false;
    }
  }

  static async createRoom(client, serverId, name, type) {
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
          type: type,
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
    }
  }

  static async reconnectToRoom(client, roomId) {
    try {
      UIManager.addMessage('System', 'Переподключение к комнате...');
      
      client.wasMicActiveBeforeReconnect = client.isMicActive;
      
      if (client.isMicActive && client.mediaData) {
        await MediaManager.stopMicrophone(client);
      }
      
      await this.leaveRoom(client);
      
      client.isReconnecting = true;
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = await this.joinRoom(client, roomId);
      
      client.isReconnecting = false;
      
      if (client.wasMicActiveBeforeReconnect && client.mediaData && client.roomType === 'voice') {
        setTimeout(async () => {
          try {
            await MediaManager.startMicrophone(client);
            client.wasMicActiveBeforeReconnect = false;
          } catch (error) {
            UIManager.showError('Не удалось восстановить микрофон после переподключения');
          }
        }, 1000);
      }
      
      return result;
    } catch (error) {
      client.isReconnecting = false;
      UIManager.addMessage('System', 'Ошибка переподключения: ' + error.message);
      throw error;
    }
  }
}

export default RoomManager;
