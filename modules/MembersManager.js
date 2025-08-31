import UIManager from './UIManager.js';

class MembersManager {
    static members = new Map();

    static updateMemberMicState(clientId, isActive) {
        if (this.members.has(clientId)) {
            const member = this.members.get(clientId);
            member.isMicActive = isActive;
            this.members.set(clientId, member);
            UIManager.updateMembersList(Array.from(this.members.values()));
        }
    }

    static addMember(memberData) {
        // Для участников текстовых комнат (с префиксом sse_) всегда устанавливаем isMicActive в false
        const isTextParticipant = memberData.clientId && memberData.clientId.startsWith('sse_');
        const processedMemberData = {
            ...memberData,
            isMicActive: isTextParticipant ? false : (memberData.isMicActive || false)
        };

        if (!this.members.has(processedMemberData.clientId)) {
            this.members.set(processedMemberData.clientId, processedMemberData);
            UIManager.updateMembersList(Array.from(this.members.values()));
        } else {
            // Если участник уже есть, обновляем его данные
            this.members.set(processedMemberData.clientId, processedMemberData);
            UIManager.updateMembersList(Array.from(this.members.values()));
        }
    }

    static removeMember(clientId) {
        if (this.members.has(clientId)) {
            this.members.delete(clientId);
            UIManager.updateMembersList(Array.from(this.members.values()));
        }
    }

    static clearMembers() {
        this.members.clear();
        UIManager.updateMembersList([]);
    }

    static updateAllMembers(members) {
        this.members.clear();
        
        // Обрабатываем каждого участника, устанавливая правильное состояние микрофона
        members.forEach(member => {
            const isTextParticipant = member.clientId && member.clientId.startsWith('sse_');
            const processedMember = {
                ...member,
                isMicActive: isTextParticipant ? false : (member.isMicActive || false)
            };
            this.members.set(processedMember.clientId, processedMember);
        });
        
        UIManager.updateMembersList(members);
    }

    static setupSocketHandlers(client) {
        if (!client.socket) return;

        client.socket.on('member-mic-state', (data) => {
            this.updateMemberMicState(data.clientId, data.isActive);
        });

        client.socket.on('member-joined', (data) => {
            this.addMember(data);
        });

        client.socket.on('member-left', (data) => {
            this.removeMember(data.clientId);
        });

        client.socket.on('members-list', (members) => {
            this.updateAllMembers(members);
        });
    }

    // Новый метод для обработки участников из SSE (текстовые комнаты)
    static setupSSEHandlers(client) {
        // Обработчики для SSE событий уже добавлены в TextChatManager
        // Этот метод оставлен для будущего расширения, если потребуется
        console.log('SSE handlers for members are setup in TextChatManager');
    }

    // Новый метод для получения текущего списка участников
    static getMembers() {
        return Array.from(this.members.values());
    }

    // Новый метод для поиска участника по clientId
    static getMember(clientId) {
        return this.members.get(clientId);
    }

    // Новый метод для проверки, является ли участник текущим пользователем
    static isCurrentUser(client, clientId) {
        return client.clientID === clientId;
    }

    // Новый метод для обновления статуса микрофона текущего пользователя
    static updateCurrentUserMicState(client, isActive) {
        if (client.clientID) {
            this.updateMemberMicState(client.clientID, isActive);
            
            // Отправляем событие на сервер о изменении статуса микрофона
            if (client.socket && client.currentRoom) {
                client.socket.emit('mic-state-change', {
                    roomId: client.currentRoom,
                    isActive: isActive
                });
            }
        }
    }

    // Новый метод для инициализации участников при подключении к комнате
    static initializeRoomMembers(client, members) {
        this.clearMembers();
        
        // Добавляем текущего пользователя в список
        if (client.clientID && client.username) {
            this.addMember({
                clientId: client.clientID,
                username: client.username,
                userId: client.userId,
                isMicActive: client.isMicActive || false
            });
        }
        
        // Добавляем остальных участников
        if (members && Array.isArray(members)) {
            members.forEach(member => {
                if (member.clientId !== client.clientID) {
                    this.addMember(member);
                }
            });
        }
    }
}

export default MembersManager;
