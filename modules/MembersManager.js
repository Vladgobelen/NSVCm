// modules/MembersManager.js
import UIManager from './UIManager.js';

class MembersManager {
    static members = new Map();
    static onlineMembers = [];
    static offlineMembers = [];
    static collapsedSections = {
        online: false,
        offline: false
    };

    static init() {
        const saved = localStorage.getItem('membersListCollapsed');
        if (saved) {
            try {
                this.collapsedSections = JSON.parse(saved);
            } catch (e) {
                this.collapsedSections = { online: false, offline: false };
            }
        }
    }

    static saveCollapsedState() {
        localStorage.setItem('membersListCollapsed', JSON.stringify(this.collapsedSections));
    }

    static toggleSection(section) {
        if (section === 'online' || section === 'offline') {
            this.collapsedSections[section] = !this.collapsedSections[section];
            this.saveCollapsedState();
            UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
        }
    }

    static isSectionCollapsed(section) {
        return this.collapsedSections[section] || false;
    }

    static updateMember(userId, updates) {
        if (this.members.has(userId)) {
            const member = { ...this.members.get(userId), ...updates };
            this.members.set(userId, member);
            this._updateOnlineOfflineLists();
            UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
            UIManager.updateMemberMicState(userId, updates.isMicActive);
        }
    }

    static addMember(memberData) {
        if (!memberData.userId) {
            console.error('Member data must contain userId');
            return;
        }

        const existingMember = this.members.get(memberData.userId);
        let isCurrentlyOnline = true;

        if (existingMember) {
            isCurrentlyOnline = existingMember.isOnline;
        }

        const processedMemberData = {
            userId: memberData.userId,
            username: memberData.username || `User_${memberData.userId.substr(0, 8)}`,
            isMicActive: memberData.isMicActive || false,
            isOnline: memberData.isOnline !== undefined ? memberData.isOnline : isCurrentlyOnline,
            clientId: memberData.clientId || null
        };

        this.members.set(processedMemberData.userId, processedMemberData);
        this._updateOnlineOfflineLists();
        UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
    }

    static removeMember(userId) {
        if (this.members.has(userId)) {
            this.members.delete(userId);
            this._updateOnlineOfflineLists();
            UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
        }
    }

    static clearMembers() {
        this.members.clear();
        this.onlineMembers = [];
        this.offlineMembers = [];
        UIManager.updateMembersListWithStatus([], []);
    }

    static updateAllMembers(members) {
        this.members.clear();
        members.forEach(member => {
            this.members.set(member.userId, member);
        });
        this._updateOnlineOfflineLists();
        UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
    }

    static updateAllMembersWithStatus(online, offline) {
        this.members.clear();
        this.onlineMembers = online || [];
        this.offlineMembers = offline || [];

        [...this.onlineMembers, ...this.offlineMembers].forEach(member => {
            if (member && member.userId) {
                this.members.set(member.userId, member);
            }
        });

        console.log(`👥 MembersManager: ${this.onlineMembers.length} онлайн, ${this.offlineMembers.length} оффлайн`);
        UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
    }

    static _updateOnlineOfflineLists() {
        this.onlineMembers = [];
        this.offlineMembers = [];

        this.members.forEach(member => {
            if (member.isOnline === true) {
                this.onlineMembers.push(member);
            } else {
                this.offlineMembers.push(member);
            }
        });

        this.onlineMembers.sort((a, b) => a.username.localeCompare(b.username));
        this.offlineMembers.sort((a, b) => a.username.localeCompare(b.username));
    }

    static setupSocketHandlers(client) {
        if (!client.socket) return;

        client.socket.on('room-participants', (participants) => {
            console.log('👥 Получен список участников:', participants.length);
            const processedParticipants = participants.map((p) => {
                if (p.userId === this.userId) {
                    return { ...p, isOnline: true };
                }
                return p;
            });
            MembersManager.updateAllMembers(processedParticipants);

            const me = processedParticipants.find((p) => p.userId === this.userId);
            if (me) {
                window.voiceClient.userId = me.userId;
                const displayName = me.username || me.name || me.userId;
                if (typeof window.setLoggerDisplayName === 'function') {
                    window.setLoggerDisplayName(displayName);
                }
            }
        });

        client.socket.on('room-participants-updated', (data) => {
            console.log('👥 Room participants updated:', data);
            console.log(`👥 Онлайн: ${data.online?.length || 0}, Офлайн: ${data.offline?.length || 0}`);

            if ((!data.online || data.online.length === 0) && (!data.offline || data.offline.length === 0)) {
                console.warn('⚠️ Получены пустые данные участников, игнорируем');
                return;
            }

            MembersManager.updateAllMembersWithStatus(data.online, data.offline);
        });

        client.socket.on('user-joined', async (user) => {
            if (this.members.has(user.userId)) {
                this.updateMember(user.userId, {
                    ...user,
                    isOnline: true
                });
            } else {
                this.addMember({
                    ...user,
                    isOnline: true
                });
            }
            UIManager.addMessage('System', `Пользователь ${user.username} присоединился к комнате`);
        });

        client.socket.on('user-left', async (data) => {
            const member = MembersManager.getMember(data.userId);
            if (member) {
                this.updateMember(data.userId, { isOnline: false });
                UIManager.addMessage('System', `Пользователь ${member.username} покинул комнату`);
            } else {
                UIManager.addMessage('System', `Пользователь покинул комнату`);
            }
        });

        client.socket.on('user-mic-state', (data) => {
            if (data.userId) {
                this.updateMember(data.userId, { isMicActive: data.isActive });
            } else if (data.clientID) {
                const members = Array.from(this.members.values());
                const member = members.find(m => m.clientId === data.clientID);
                if (member) {
                    this.updateMember(member.userId, { isMicActive: data.isActive });
                }
            }
        });
    }

    static setupSSEHandlers() {
    }

    static getMembers() {
        return Array.from(this.members.values());
    }

    static getMember(userId) {
        return this.members.get(userId);
    }

    static getOnlineMembers() {
        return this.onlineMembers;
    }

    static getOfflineMembers() {
        return this.offlineMembers;
    }

    static isCurrentUser(client, userId) {
        return client.userId === userId;
    }

    static initializeRoomMembers(client, participants) {
        this.clearMembers();
        participants.forEach(participant => this.addMember(participant));
    }
}

export default MembersManager;
