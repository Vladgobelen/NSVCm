import UIManager from './UIManager.js';

class MembersManager {
    static members = new Map();

    static updateMemberMicState(clientId, isActive) {
        console.log(`🎤 Обновление состояния микрофона: ${clientId} -> ${isActive}`);
        if (this.members.has(clientId)) {
            const member = this.members.get(clientId);
            member.isMicActive = isActive;
            this.members.set(clientId, member);
        }
        UIManager.updateMembersList(Array.from(this.members.values()));
    }

    static addMember(memberData) {
        console.log(`➕ Добавление участника: ${memberData.clientId} (${memberData.username})`);
        // Проверяем, не является ли пользователь уже в списке
        if (!this.members.has(memberData.clientId)) {
            this.members.set(memberData.clientId, {
                clientId: memberData.clientId,
                username: memberData.username,
                isMicActive: memberData.isMicActive || false
            });
            UIManager.updateMembersList(Array.from(this.members.values()));
        } else {
            console.log(`⚠️ Участник уже в списке: ${memberData.clientId}`);
        }
    }

    static removeMember(clientId) {
        console.log(`➖ Удаление участника: ${clientId}`);
        if (this.members.has(clientId)) {
            this.members.delete(clientId);
            UIManager.updateMembersList(Array.from(this.members.values()));
        }
    }

    static clearMembers() {
        console.log(`🧹 Очистка списка участников`);
        this.members.clear();
        UIManager.updateMembersList([]);
    }

    static updateAllMembers(members) {
        console.log(`🔄 Полное обновление списка участников:`, members);
        this.members.clear();
        members.forEach(member => {
            this.members.set(member.clientId, member);
        });
        UIManager.updateMembersList(members);
    }

    static setupSocketHandlers(client) {
        if (!client.socket) return;

        // Обновление состояния микрофона участника
        client.socket.on('member-mic-state', (data) => {
            console.log('📢 Получен member-mic-state:', data);
            this.updateMemberMicState(data.clientId, data.isActive);
        });

        // Новый участник присоединился
        client.socket.on('member-joined', (data) => {
            console.log('📢 Получен member-joined:', data);
            this.addMember(data);
        });

        // Участник вышел
        client.socket.on('member-left', (data) => {
            console.log('📢 Получен member-left:', data);
            this.removeMember(data.clientId);
        });

        // Полный список участников при подключении или обновлении
        client.socket.on('members-list', (members) => {
            console.log('📢 Получен members-list:', members);
            this.updateAllMembers(members);
        });
    }
}

export default MembersManager;
