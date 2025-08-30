import UIManager from './UIManager.js';

class MembersManager {
    static members = new Map();

    static updateMemberMicState(clientId, isActive) {
        if (this.members.has(clientId)) {
            const member = this.members.get(clientId);
            member.isMicActive = isActive;
            this.members.set(clientId, member);
        }
        UIManager.updateMembersList(Array.from(this.members.values()));
    }

    static addMember(memberData) {
        if (!this.members.has(memberData.clientId)) {
            this.members.set(memberData.clientId, {
                clientId: memberData.clientId,
                username: memberData.username,
                isMicActive: memberData.isMicActive || false
            });
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
        members.forEach(member => {
            this.members.set(member.clientId, member);
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
}

export default MembersManager;
