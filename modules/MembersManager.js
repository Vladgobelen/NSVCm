import UIManager from './UIManager.js';

class MembersManager {
    static members = new Map();

static updateMember(userId, updates) {
    if (this.members.has(userId)) {
        // 🔴🔴🔴 АГРЕССИВНЫЙ ДЕБАГ: Логируем состояние ПЕРЕД обновлением
        console.group('🔴🔴🔴 [DEBUG] MEMBERS MANAGER: updateMember CALLED');
        console.log('🎯 [DEBUG] TARGET userId:', userId);
        console.log('🎯 [DEBUG] UPDATES received:', JSON.stringify(updates, null, 2));
        console.log('🎯 [DEBUG] STATE BEFORE update:', JSON.stringify(this.members.get(userId), null, 2));
        console.groupEnd();

        const member = { ...this.members.get(userId), ...updates };
        this.members.set(userId, member);

        // 🔴🔴🔴 АГРЕСИВНЫЙ ДЕБАГ: Логируем состояние ПОСЛЕ обновления
        console.group('🔴🔴🔴 [DEBUG] MEMBERS MANAGER: updateMember FINISHED');
        console.log('🎯 [DEBUG] STATE AFTER update:', JSON.stringify(this.members.get(userId), null, 2));
        console.groupEnd();

        UIManager.updateMembersList(Array.from(this.members.values()));
        // Обновляем UI для конкретного участника
        UIManager.updateMemberMicState(userId, updates.isMicActive);
    }
}

// modules/MembersManager.js
static addMember(memberData) {
    if (!memberData.userId) {
        console.error('Member data must contain userId');
        return;
    }
    console.group('🔴🔴🔴 [DEBUG] MEMBERS MANAGER: addMember CALLED');
    console.log('🎯 [DEBUG] RAW INPUT memberData:', JSON.stringify(memberData, null, 2));
    console.groupEnd();

    // 🔴🔴🔴 КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ:
    // Получаем текущего пользователя, если он уже существует.
    const existingMember = this.members.get(memberData.userId);
    let isCurrentlyOnline = true; // По умолчанию true для нового пользователя

    if (existingMember) {
        isCurrentlyOnline = existingMember.isOnline;
        // 🔴🔴🔴 ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Если это текущий пользователь, ВСЕГДА сохраняем его статус как true.
        if (this.client && memberData.userId === this.client.userId) {
            isCurrentlyOnline = true;
        }
    }

    const processedMemberData = {
        userId: memberData.userId,
        username: memberData.username || `User_${memberData.userId.substr(0, 8)}`,
        isMicActive: memberData.isMicActive || false,
        isOnline: memberData.isOnline !== undefined ? memberData.isOnline : isCurrentlyOnline,
        clientId: memberData.clientId || null
    };

    console.group('🔴🔴🔴 [DEBUG] MEMBERS MANAGER: addMember PROCESSED');
    console.log('🎯 [DEBUG] PROCESSED memberData:', JSON.stringify(processedMemberData, null, 2));
    console.groupEnd();

    this.members.set(processedMemberData.userId, processedMemberData);
    UIManager.updateMembersList(Array.from(this.members.values()));
}
    static removeMember(userId) {
        if (this.members.has(userId)) {
            this.members.delete(userId);
            UIManager.updateMembersList(Array.from(this.members.values()));
        }
    }

    static clearMembers() {
        this.members.clear();
        UIManager.updateMembersList([]);
    }

// modules/MembersManager.js
static updateAllMembers(members) {
    // Создаем Set из ID новых участников для быстрого поиска
    const newMemberIds = new Set(members.map(m => m.userId));
    // Удаляем пользователей, которых больше нет в списке
    for (const userId of this.members.keys()) {
        if (!newMemberIds.has(userId)) {
            this.members.delete(userId);
        }
    }
    // Обновляем или добавляем пользователей из нового списка
    members.forEach(member => {
        if (this.members.has(member.userId)) {
            // Обновляем существующего пользователя
            const existingMember = this.members.get(member.userId);
            this.members.set(member.userId, {
                ...existingMember,
                ...member, // Обновляем все поля, которые пришли
                // 🔴🔴🔴 КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Сохраняем isOnline, если он не пришел в новом событии
                isOnline: member.isOnline !== undefined ? member.isOnline : existingMember.isOnline
            });
        } else {
            // Добавляем нового пользователя
            this.addMember(member);
        }
    });
    // Обновляем UI
    UIManager.updateMembersList(Array.from(this.members.values()));
}

static setupSocketHandlers(client) {
    if (!client.socket) return;
    client.socket.on('room-participants', (participants) => {
        this.updateAllMembers(participants);
    });

    // --- ИЗМЕНЕННЫЙ ОБРАБОТЧИК ---
    // Было: client.socket.on('user-joined', (user) => { this.addMember(user); });
    // Стало:
// modules/MembersManager.js
// --- ИЗМЕНЕННЫЙ ОБРАБОТЧИК ---
client.socket.on('user-joined', async (user) => { // <-- Добавили async
    console.log('User joined (ONLINE):', user);
    // Проверяем, существует ли пользователь
    if (this.members.has(user.userId)) {
        // Если существует, обновляем его данные и статус онлайн
        this.updateMember(user.userId, { 
            ...user,
            isOnline: true 
        });
    } else {
        // Если не существует, добавляем нового пользователя
        this.addMember({
            ...user,
            isOnline: true
        });
    }
    UIManager.addMessage('System', `Пользователь ${user.username} присоединился к комнате`);

    // 🔴🔴🔴 НОВОЕ: Запрашиваем полный список участников с сервера для гарантии синхронизации
    try {
        const response = await fetch(`${client.API_SERVER_URL}/api/rooms/${client.currentRoom}/participants`, {
            headers: {
                'Authorization': `Bearer ${client.token}`,
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.participants && Array.isArray(data.participants)) {
                this.updateAllMembers(data.participants);
            }
        }
    } catch (error) {
        console.error('Failed to sync full participants list after user joined:', error);
    }
    // 🔴🔴🔴 КОНЕЦ НОВОГО КОДА
});
// --- КОНЕЦ ИЗМЕНЕНИЙ ---


    // --- КОНЕЦ ИЗМЕНЕНИЙ ---

client.socket.on('user-left', (data) => {
    console.log('User left (OFFLINE):', data);
    // Обновляем существующего пользователя, устанавливая isOnline: false
    this.updateMember(data.userId, { isOnline: false });
    // Получаем имя пользователя из списка, чтобы отобразить в сообщении
    const member = this.getMember(data.userId);
    if (member) {
        UIManager.addMessage('System', `Пользователь ${member.username} покинул комнату`);
    } else {
        UIManager.addMessage('System', `Пользователь покинул комнату`);
    }
});

    client.socket.on('user-mic-state', (data) => {
        if (data.userId) {
            this.updateMember(data.userId, { isMicActive: data.isActive });
        } else if (data.clientID) {
            // Находим пользователя по clientID
            const members = Array.from(this.members.values());
            const member = members.find(m => m.clientId === data.clientID);
            if (member) {
                this.updateMember(member.userId, { isMicActive: data.isActive });
            }
        }
    });
}
    static setupSSEHandlers() {
        console.log('SSE handlers for members are setup in TextChatManager');
    }

    static getMembers() {
        return Array.from(this.members.values());
    }

    static getMember(userId) {
        return this.members.get(userId);
    }

    static isCurrentUser(client, userId) {
        return client.userId === userId;
    }

    static initializeRoomMembers(client, participants) {
        console.log('Initializing room members with:', participants);
        this.clearMembers();
        participants.forEach(participant => this.addMember(participant));
    }
}

export default MembersManager;
