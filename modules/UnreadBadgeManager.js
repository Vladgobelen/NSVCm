class UnreadBadgeManager {
    static client = null;
    static unreadCounts = {};
    static unreadVersion = 0;
    static unreadLastSync = null;

    static setClient(client) {
        this.client = client;
    }

    static syncUnreadCounts(serverData) {
        this.unreadVersion++;
        this.unreadLastSync = new Date().toISOString();
        this.unreadCounts = {};

        for (const [serverId, rooms] of Object.entries(serverData)) {
            if (!this.unreadCounts[serverId]) {
                this.unreadCounts[serverId] = { total: 0, personalTotal: 0, hasMentionTotal: false, rooms: {} };
            }
            for (const [roomId, roomData] of Object.entries(rooms)) {
                this.unreadCounts[serverId].rooms[roomId] = {
                    count: roomData.count || 0,
                    hasMention: roomData.hasMention || false,
                    personalCount: roomData.personalCount || 0
                };
                this.unreadCounts[serverId].total += roomData.count || 0;
                this.unreadCounts[serverId].personalTotal += roomData.personalCount || 0;
                if (roomData.hasMention) this.unreadCounts[serverId].hasMentionTotal = true;
            }
        }

        this.updateServerBadges();
        this.updateRoomBadges();
        this.updateTotalBadge();
        if (this.client) this.updateRoomTitleBadge(this.client);
    }

    static updateServerBadges() {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) return;

        serversList.querySelectorAll('.server-item').forEach((item) => {
            const serverId = item.dataset.server;
            const existingBadge = item.querySelector('.unread-badge');
            if (existingBadge) existingBadge.remove();

            let serverData = this.unreadCounts[serverId];
            if (!serverData && serverId?.startsWith('user_')) {
                for (const sid in this.unreadCounts) {
                    if (sid === serverId) { serverData = this.unreadCounts[sid]; break; }
                }
            }
            if (!serverData && this.unreadCounts['null']) {
                const nullData = this.unreadCounts['null'];
                if (nullData.rooms?.[serverId]) {
                    serverData = {
                        total: nullData.rooms[serverId].count || 0,
                        personalTotal: nullData.rooms[serverId].personalCount || 0,
                        hasMentionTotal: nullData.rooms[serverId].hasMention || false
                    };
                }
            }

            if (serverData && serverData.total > 0) {
                const badge = document.createElement('span');
                badge.className = 'unread-badge' + (serverData.hasMentionTotal ? ' has-mention' : '');
                badge.textContent = serverData.personalTotal > 0
                    ? `${serverData.total}@${serverData.personalTotal}`
                    : serverData.total;
                item.appendChild(badge);
            }
        });
    }

    static updateRoomBadges() {
        const roomsList = document.querySelector('.rooms-list');
        if (!roomsList) return;

        roomsList.querySelectorAll('.room-item').forEach((item) => {
            const roomId = item.dataset.room;
            const existingBadge = item.querySelector('.room-unread-badge');
            if (existingBadge) existingBadge.remove();

            for (const serverId in this.unreadCounts) {
                const roomData = this.unreadCounts[serverId].rooms?.[roomId];
                if (roomData && roomData.count > 0) {
                    const badge = document.createElement('span');
                    badge.className = 'room-unread-badge' + (roomData.hasMention ? ' has-mention' : '');
                    badge.textContent = roomData.personalCount > 0
                        ? `${roomData.count}@${roomData.personalCount}`
                        : roomData.count;
                    item.appendChild(badge);
                    break;
                }
            }
        });
    }

    static updateTotalBadge() {
        let totalCount = 0;
        let totalPersonalCount = 0;
        let totalHasMention = false;

        for (const serverId in this.unreadCounts) {
            totalCount += this.unreadCounts[serverId].total || 0;
            totalPersonalCount += this.unreadCounts[serverId].personalTotal || 0;
            if (this.unreadCounts[serverId].hasMentionTotal) totalHasMention = true;
        }

        const currentRoomTitle = document.querySelector('.current-room-title');
        if (currentRoomTitle) {
            let existingTitleBadge = currentRoomTitle.querySelector('.title-unread-badge');
            if (existingTitleBadge) existingTitleBadge.remove();
            if (totalCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'title-unread-badge';
                badge.textContent = totalCount > 99 ? '99+' : totalCount;
                currentRoomTitle.appendChild(badge);
            }
        }
    }

    static updateRoomTitleBadge(client) {
        const titleElement = document.querySelector('.current-room-title');
        if (!titleElement) return;
        const existingBadge = titleElement.querySelector('.room-unread-badge');
        if (existingBadge) existingBadge.remove();
        if (!client || !client.currentRoom) return;

        let roomUnreadData = null;
        for (const serverId in this.unreadCounts) {
            if (this.unreadCounts[serverId].rooms?.[client.currentRoom]) {
                roomUnreadData = this.unreadCounts[serverId].rooms[client.currentRoom];
                break;
            }
        }

        if (roomUnreadData && roomUnreadData.count > 0) {
            const badge = document.createElement('span');
            badge.className = 'room-unread-badge';
            badge.textContent = roomUnreadData.personalCount > 0
                ? `${roomUnreadData.count}@${roomUnreadData.personalCount}`
                : roomUnreadData.count;
            titleElement.appendChild(badge);
        }
    }

    static setUnreadCount(serverId, roomId, count, hasMention, personalCount = 0) {
        if (!serverId) serverId = roomId;
        let normalizedServerId = serverId;
        if (serverId.startsWith('user_') || serverId.startsWith('direct_')) {
            normalizedServerId = roomId || serverId;
        }

        if (!this.unreadCounts[normalizedServerId]) {
            this.unreadCounts[normalizedServerId] = { total: 0, personalTotal: 0, hasMentionTotal: false, rooms: {} };
        }

        this.unreadCounts[normalizedServerId].rooms[roomId] = { count, hasMention, personalCount };

        this.unreadCounts[normalizedServerId].total = 0;
        this.unreadCounts[normalizedServerId].personalTotal = 0;
        this.unreadCounts[normalizedServerId].hasMentionTotal = false;

        for (const rid in this.unreadCounts[normalizedServerId].rooms) {
            const data = this.unreadCounts[normalizedServerId].rooms[rid];
            this.unreadCounts[normalizedServerId].total += data.count || 0;
            this.unreadCounts[normalizedServerId].personalTotal += data.personalCount || 0;
            if (data.hasMention) this.unreadCounts[normalizedServerId].hasMentionTotal = true;
        }

        this.updateServerBadges();
        this.updateRoomBadges();
        this.updateTotalBadge();
        this.updateRoomTitleBadge(this.client);
    }

    static clearUnreadForServer(serverId) {
        if (this.unreadCounts[serverId]) {
            delete this.unreadCounts[serverId];
            this.updateServerBadges();
            this.updateRoomBadges();
            this.updateTotalBadge();
        }
    }

    static clearUnreadForRoom(serverId, roomId) {
        if (!serverId) serverId = roomId;
        let normalizedServerId = serverId;
        if (serverId.startsWith('user_') || serverId.startsWith('direct_')) {
            normalizedServerId = roomId || serverId;
        }

        if (this.unreadCounts[normalizedServerId]?.rooms?.[roomId]) {
            delete this.unreadCounts[normalizedServerId].rooms[roomId];

            this.unreadCounts[normalizedServerId].total = 0;
            this.unreadCounts[normalizedServerId].personalTotal = 0;
            this.unreadCounts[normalizedServerId].hasMentionTotal = false;

            for (const rid in this.unreadCounts[normalizedServerId].rooms) {
                const data = this.unreadCounts[normalizedServerId].rooms[rid];
                this.unreadCounts[normalizedServerId].total += data.count || 0;
                this.unreadCounts[normalizedServerId].personalTotal += data.personalCount || 0;
                if (data.hasMention) this.unreadCounts[normalizedServerId].hasMentionTotal = true;
            }

            if (this.unreadCounts[normalizedServerId].total === 0) {
                delete this.unreadCounts[normalizedServerId];
            }

            this.updateServerBadges();
            this.updateRoomBadges();
            this.updateTotalBadge();
            this.updateRoomTitleBadge(this.client);
        }
    }

    static clearAllUnread() {
        this.unreadCounts = {};
        this.updateServerBadges();
        this.updateRoomBadges();
        this.updateTotalBadge();
    }

    static getSyncStatus() {
        return {
            version: this.unreadVersion,
            lastSync: this.unreadLastSync,
            localTotal: this.getLocalUnreadTotal()
        };
    }

    static getLocalUnreadTotal() {
        let total = 0;
        for (const serverId in this.unreadCounts) {
            total += this.unreadCounts[serverId].total || 0;
        }
        return total;
    }
}

export default UnreadBadgeManager;
