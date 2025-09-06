import UIManager from './UIManager.js';

class MembersManager {
    static members = new Map();

    static updateMember(userId, updates) {
        if (this.members.has(userId)) {
            const member = { ...this.members.get(userId), ...updates };
            this.members.set(userId, member);
            UIManager.updateMembersList(Array.from(this.members.values()));
            
            // Обновляем UI для конкретного участника
            UIManager.updateMemberMicState(userId, updates.isMicActive);
        }
    }

    static addMember(memberData) {
        if (!memberData.userId) {
            console.error('Member data must contain userId');
            return;
        }

        const processedMemberData = {
            userId: memberData.userId,
            username: memberData.username || `User_${memberData.userId.substr(0, 8)}`,
            isMicActive: memberData.isMicActive || false,
            isOnline: true,
            clientId: memberData.clientId || null
        };

        if (!this.members.has(processedMemberData.userId)) {
            this.members.set(processedMemberData.userId, processedMemberData);
            UIManager.updateMembersList(Array.from(this.members.values()));
        } else {
            this.updateMember(processedMemberData.userId, processedMemberData);
        }
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

    static updateAllMembers(members) {
        this.members.clear();
        members.forEach(member => this.addMember(member));
    }

    static setupSocketHandlers(client) {
        if (!client.socket) return;

        client.socket.on('room-participants', (participants) => {
            this.updateAllMembers(participants);
        });

        client.socket.on('user-joined', (user) => {
            this.addMember(user);
        });

        client.socket.on('user-left', (data) => {
            this.removeMember(data.userId);
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
