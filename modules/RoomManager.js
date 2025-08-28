import UIManager from './UIManager.js';

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
            
        } catch (error) {
            console.error('Критическая ошибка при загрузке комнат:', error);
            UIManager.addMessage('System', `Ошибка: ${error.message}`);
            UIManager.updateStatus('Ошибка загрузки комнат', 'disconnected');
        }
    }

    static async createRoom(client) {
        if (client.isCreatingRoom) return;
        client.isCreatingRoom = true;

        try {
            const name = prompt('Введите название комнаты:');
            if (!name || name.length < 3) {
                alert('Название должно быть от 3 символов');
                return;
            }
            const type = confirm('Голосовая комната?') ? 'voice' : 'text';

            console.log(`Создание комнаты: ${name}, тип: ${type}`);

            const res = await fetch(`${client.API_SERVER_URL}/api/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    serverId: client.currentServerId,
                    name: name.trim(),
                    type: type,
                    userId: client.userId,
                    token: client.token
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(`Не удалось создать комнату: ${errorData.error || res.statusText}`);
            }

            UIManager.addMessage('System', `Комната "${name}" создана!`);
            await RoomManager.loadRoomsForServer(client, client.currentServerId);

        } catch (error) {
            console.error('Ошибка при создании комнаты:', error);
            alert('Ошибка: ' + error.message);
        } finally {
            client.isCreatingRoom = false;
        }
    }
    
    static async reconnectToRoom(client, roomId) {
        console.log(`reconnectToRoom: ${roomId}`);
        client.disconnectFromMedia();
        client.destroySocket();
        client.currentRoom = roomId;
        await client.joinRoom(roomId);
    }
}

export default RoomManager;
