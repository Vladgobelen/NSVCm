import UIManager from './UIManager.js';
import MediaManager from './MediaManager.js';

class RoomManager {
  static async loadRoomsForServer(client, serverId) {
    try {
      console.log('Загрузка комнат для сервера:', serverId);
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
      
      console.log('Получены комнаты:', data.rooms);
      UIManager.renderRooms(client, data.rooms);
      UIManager.updateStatus('Комнаты загружены', 'normal');
      
      // Обновляем статус кнопки микрофона в зависимости от типа комнаты
      if (client.currentRoom) {
        const room = data.rooms.find(r => r.id === client.currentRoom);
        if (room && room.type === 'voice') {
          UIManager.updateMicStatus(client.isMicActive);
        }
      }
    } catch (error) {
      console.error('Ошибка загрузки комнат:', error);
      UIManager.updateStatus('Ошибка загрузки комнат', 'error');
      UIManager.showError('Не удалось загрузить комнаты: ' + error.message);
    }
  }

  static async joinRoom(client, roomId) {
    try {
      console.log(`Попытка присоединиться к комнате: ${roomId}`);
      
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
      
      console.log(`Успешно присоединился к комнате: ${roomId}, тип: ${client.roomType}`);
      
      // Если это голосовая комната, подключаемся к медиасерверу
      if (client.roomType === 'voice') {
        try {
          await MediaManager.connectToMediaServer(client, roomId);
          UIManager.updateRoomUI(client);
          
          // Начинаем потреблять существующие producer'ы
          await MediaManager.startConsumingProducers(client);
        } catch (mediaError) {
          console.error('Ошибка подключения к медиасерверу:', mediaError);
          UIManager.showError('Не удалось подключиться к голосовой комнате: ' + mediaError.message);
          throw mediaError;
        }
      } else {
        UIManager.updateRoomUI(client);
      }
      
      UIManager.addMessage('System', `✅ Вы присоединились к комнате`);
      return true;
    } catch (error) {
      console.error('Ошибка присоединения к комнате:', error);
      UIManager.showError('Не удалось присоединиться к комнате: ' + error.message);
      throw error;
    }
  }

  static async leaveRoom(client) {
    if (!client.currentRoom) return;
    
    try {
      console.log(`Покидание комнаты: ${client.currentRoom}`);
      
      // Если это голосовая комната, отключаемся от медиасервера
      if (client.roomType === 'voice' && client.isConnected) {
        MediaManager.disconnect(client);
      }
      
      // Отправляем запрос на выход из комнаты
      await fetch(`${client.API_SERVER_URL}/api/rooms/${client.currentRoom}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Очищаем данные комнаты
      client.currentRoom = null;
      client.roomType = null;
      
      UIManager.updateRoomUI(client);
      UIManager.addMessage('System', `✅ Вы покинули комнату`);
      return true;
    } catch (error) {
      console.error('Ошибка при покидании комнаты:', error);
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
      
      // Перезагружаем список комнат для текущего сервера
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
      
      // Перезагружаем список комнат
      if (client.currentServerId) {
        await this.loadRoomsForServer(client, client.currentServerId);
      }
      
      // Если мы были в удаляемой комнате, покидаем её
      if (client.currentRoom === roomId) {
        await this.leaveRoom(client);
      }
      
      UIManager.addMessage('System', `✅ Комната удалена`);
    } catch (error) {
      console.error('Ошибка удаления комнаты:', error);
      UIManager.showError('Ошибка: ' + error.message);
    }
  }

  // ИЗМЕНЕННЫЙ КОД: Улучшенное переподключение к комнате
  static async reconnectToRoom(client, roomId) {
    try {
      UIManager.addMessage('System', 'Переподключение к комнате...');
      
      // Сохраняем состояние микрофона перед отключением
      client.wasMicActiveBeforeReconnect = client.isMicActive;
      
      // Сначала останавливаем микрофон, если он активен
      if (client.isMicActive && client.mediaData) {
        await MediaManager.stopMicrophone(client);
      }
      
      // Отключаемся от комнаты
      await this.leaveRoom(client);
      
      // Устанавливаем флаг переподключения
      client.isReconnecting = true;
      
      // Ждем небольшую паузу для завершения очистки
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Подключаемся к комнате
      const result = await this.joinRoom(client, roomId);
      
      // Сбрасываем флаг переподключения
      client.isReconnecting = false;
      
      // Если микрофон был активен до переподключения, пытаемся его снова включить
      if (client.wasMicActiveBeforeReconnect && client.mediaData && client.roomType === 'voice') {
        setTimeout(async () => {
          try {
            await MediaManager.startMicrophone(client);
            client.wasMicActiveBeforeReconnect = false;
          } catch (error) {
            console.error('[MEDIA] Не удалось восстановить микрофон после переподключения:', error);
            UIManager.showError('Не удалось восстановить микрофон после переподключения');
          }
        }, 1000);
      }
      
      return result;
    } catch (error) {
      client.isReconnecting = false;
      console.error('Ошибка при переподключении к комнате:', error);
      UIManager.addMessage('System', 'Ошибка переподключения: ' + error.message);
      throw error;
    }
  }
}

export default RoomManager;
