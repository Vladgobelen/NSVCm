// rooms.js (исправленный)
class RoomManager {
    static async loadRoomsForServer(client, serverId) {
        try {
            console.log('[ROOMS] loadRoomsForServer — начало выполнения');
            console.log(`[ROOMS] Параметры: client=${client ? 'объект' : 'null'}, serverId=${serverId}`);
            
            client.currentServerId = serverId;
            console.log(`[ROOMS] Установлен текущий serverId: ${client.currentServerId}`);
            
            client.currentServer = client.servers.find(s => s.id === serverId) || null;
            console.log('[ROOMS] Текущий сервер:', client.currentServer);
            
            UIManager.updateStatus(client, 'Загрузка комнат...', 'connecting');
            
            console.log(`[ROOMS] Запрос комнат для сервера: ${serverId}`);
            console.log(`[ROOMS] URL запроса: ${client.API_SERVER_URL}/api/servers/${serverId}/rooms`);
            console.log(`[ROOMS] Токен авторизации: ${client.token ? 'присутствует' : 'отсутствует'}`);
            
            const res = await fetch(`${client.API_SERVER_URL}/api/servers/${serverId}/rooms`, {
                headers: { 
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`[ROOMS] Статус ответа: ${res.status} ${res.statusText}`);
            
            if (!res.ok) {
                console.error(`[ROOMS] Ошибка загрузки комнат: ${res.status} ${res.statusText}`);
                const errorData = await res.json().catch(() => ({}));
                console.error('[ROOMS] Детали ошибки:', errorData);
                throw new Error(`Не удалось загрузить комнаты: ${errorData.error || res.statusText}`);
            }
            
            const data = await res.json();
            console.log(`[ROOMS] Получено комнат: ${data.rooms ? data.rooms.length : 0}`, data.rooms);
            
            if (!data || !Array.isArray(data.rooms)) {
                console.error('[ROOMS] Некорректный формат данных от сервера', data);
                throw new Error('Некорректные данные от сервера');
            }
            
            RoomManager.renderMobileRooms(client, data.rooms);
            RoomManager.renderDesktopRooms(client, data.rooms);
            
            UIManager.updateStatus(client, 'Комнаты загружены', 'normal');
            
        } catch (error) {
            console.error('[ROOMS] Критическая ошибка при загрузке комнат:', error);
            UIManager.addMessage(client, 'System', `Ошибка: ${error.message}`);
            UIManager.updateStatus(client, 'Ошибка загрузки комнат', 'disconnected');
        }
    }
    
    static renderMobileRooms(client, rooms) {
        console.log('[ROOMS] renderMobileRooms — начало выполнения');
        console.log(`[ROOMS] Количество комнат для отображения: ${rooms.length}`);
        
        const list = document.querySelector('.room-selector-panel .rooms-list');
        console.log('[ROOMS] Поиск элемента .room-selector-panel .rooms-list');
        
        if (!list) {
            console.error('[ROOMS] ОШИБКА: Не найден элемент .room-selector-panel .rooms-list');
            return;
        }
        
        console.log('[ROOMS] Элемент .room-selector-panel .rooms-list найден');
        
        list.innerHTML = '';
        console.log('[ROOMS] Список комнат очищен');
        
        console.log('[ROOMS] Добавление комнат в мобильный список:');
        rooms.forEach((room, index) => {
            console.log(`  [${index}] ${room.name} (ID: ${room.id}, Тип: ${room.type})`);
            
            const el = document.createElement('div');
            el.className = 'room-item';
            el.dataset.room = room.id;
            el.dataset.type = room.type;
            const isOwner = room.ownerId === client.userId;
            el.innerHTML = `${room.type === 'voice' ? '🔊' : '💬'} ${room.name} ${isOwner ? '<span class="room-owner">(Вы)</span>' : ''}`;
            
            el.addEventListener('click', () => {
                console.log(`[ROOMS] Клик по комнате: ${room.name} (ID: ${room.id})`);
                UIManager.closePanel(client, client.roomSelectorPanel);
                client.currentRoom = room.id;
                RoomManager.reconnectToRoom(client, room.id);
            });
            
            list.appendChild(el);
        });
        
        console.log('[ROOMS] Добавление кнопки создания комнаты в мобильный интерфейс');
        const btn = document.createElement('div');
        btn.className = 'room-item create-room-btn mobile-create-room-btn';
        btn.innerHTML = '<span>+</span> Создать комнату';
        
        const handleClick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('[ROOMS] Клик по кнопке создания комнаты (мобильная версия)');
            RoomManager.createRoom(client);
        };
        
        btn.addEventListener('click', handleClick);
        btn.addEventListener('touchstart', handleClick);
        
        list.appendChild(btn);
        console.log('[ROOMS] Кнопка создания комнаты добавлена в мобильный список');
    }
    
    static renderDesktopRooms(client, rooms) {
        console.log('[ROOMS] renderDesktopRooms — начало выполнения');
        console.log(`[ROOMS] Количество комнат для отображения: ${rooms.length}`);
        
        console.log('[ROOMS] Поиск элемента .rooms-list (десктопная версия)');
        const list = document.querySelector('.sidebar .rooms-list');
        
        if (!list) {
            console.error('[ROOMS] ОШИБКА: Не найден элемент .rooms-list');
            return;
        }
        
        console.log('[ROOMS] Элемент .rooms-list найден (десктопная версия)');
        
        const existingCreateBtn = list.querySelector('.create-room-btn');
        if (existingCreateBtn) {
            console.log('[ROOMS] Удаление существующей кнопки создания комнаты');
            existingCreateBtn.remove();
        }
        
        console.log('[ROOMS] Очистка списка комнат (кроме кнопки создания)');
        Array.from(list.children).forEach(child => {
            if (!child.classList.contains('create-room-btn')) {
                child.remove();
            }
        });
        
        console.log('[ROOMS] Добавление комнат в десктопный список:');
        rooms.forEach((room, index) => {
            console.log(`  [${index}] ${room.name} (ID: ${room.id}, Тип: ${room.type})`);
            
            const el = document.createElement('div');
            el.className = 'room-item';
            el.dataset.room = room.id;
            el.dataset.type = room.type;
            const isOwner = room.ownerId === client.userId;
            el.innerHTML = `${room.type === 'voice' ? '🔊' : '💬'} ${room.name} ${isOwner ? '<span class="room-owner">(Вы)</span>' : ''}`;
            
            el.addEventListener('click', () => {
                console.log(`[ROOMS] Клик по комнате: ${room.name} (ID: ${room.id})`);
                list.querySelectorAll('.room-item').forEach(i => i.classList.remove('active'));
                el.classList.add('active');
                client.currentRoom = room.id;
                RoomManager.reconnectToRoom(client, room.id);
            });
            
            list.appendChild(el);
        });
        
        console.log('[ROOMS] Создание кнопки создания комнаты для десктопной версии');
        const btn = document.createElement('div');
        btn.className = 'room-item create-room-btn desktop-create-room-btn';
        btn.innerHTML = '<span>+</span> Создать комнату';
        btn.style.order = '-1';
        
        const handleClick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('[ROOMS] Клик по кнопке создания комнаты (десктопная версия)');
            RoomManager.createRoom(client);
        };
        
        btn.addEventListener('click', handleClick);
        
        list.insertBefore(btn, list.firstChild);
        console.log('[ROOMS] КНОПКА СОЗДАНИЯ КОМНАТЫ ДОБАВЛЕНА В НАЧАЛО СПИСКА');
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

            console.log(`[ROOMS] Создание комнаты: ${name}, тип: ${type}`);

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

            UIManager.addMessage(client, 'System', `Комната "${name}" создана!`);
            await RoomManager.loadRoomsForServer(client, client.currentServerId);

        } catch (error) {
            console.error('[ROOMS] Ошибка при создании комнаты:', error);
            alert('Ошибка: ' + error.message);
        } finally {
            client.isCreatingRoom = false;
        }
    }    
        
    static async reconnectToRoom(client, roomId) {
        console.log(`[ROOMS] reconnectToRoom: ${roomId}`);
        client.disconnectFromMedia();
        client.destroySocket();
        client.currentRoom = roomId;
        await client.joinRoom(roomId);
    }
}
