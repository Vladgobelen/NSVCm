interface RoomUnreadData {
    count: number;
    hasMention: boolean;
    personalCount: number;
}

interface ServerUnreadData {
    total: number;
    personalTotal: number;
    hasMentionTotal: boolean;
    rooms: Record<string, RoomUnreadData>;
}

interface SyncStatus {
    version: number;
    lastSync: string | null;
    localTotal: number;
}

class UnreadBadgeManager {
    static client: any = null;
    static unreadCounts: Record<string, ServerUnreadData> = {};
    static unreadVersion: number = 0;
    static unreadLastSync: string | null = null;

    static setClient(client: any): void {
        this.client = client;
    }

    static syncUnreadCounts(serverData: Record<string, Record<string, RoomUnreadData>>): void {
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
        if (this.client) {
            this.updateRoomTitleBadge(this.client);
            if (this.client.currentRoom) {
                this.updateScrollButtonCounter(this.client.currentRoom);
            }
        }
    }

    static updateServerBadges(): void {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) return;

        serversList.querySelectorAll('.server-item').forEach((item: Element) => {
            const htmlItem = item as HTMLElement;
            const serverId = htmlItem.dataset.server;
            const existingBadge = htmlItem.querySelector('.unread-badge');
            if (existingBadge) existingBadge.remove();

            if (!serverId) return;

            const serverData = this.unreadCounts[serverId];
            if (serverData && serverData.total > 0) {
                const badge = document.createElement('span');
                badge.className = 'unread-badge' + (serverData.hasMentionTotal ? ' has-mention' : '');
                const regular = serverData.total - serverData.personalTotal;
                badge.textContent = serverData.personalTotal > 0
                    ? `${regular}@${serverData.personalTotal}`
                    : String(serverData.total);
                htmlItem.appendChild(badge);
            }
        });
    }

    static updateRoomBadges(): void {
        const roomsList = document.querySelector('.rooms-list');
        if (!roomsList) return;

        roomsList.querySelectorAll('.room-item').forEach((item: Element) => {
            const htmlItem = item as HTMLElement;
            const roomId = htmlItem.dataset.room;
            const serverId = htmlItem.dataset.serverId;
            const existingBadge = htmlItem.querySelector('.room-unread-badge');
            if (existingBadge) existingBadge.remove();

            if (!roomId || !serverId) return;

            const roomData = this.unreadCounts[serverId]?.rooms?.[roomId];
            if (roomData && roomData.count > 0) {
                const badge = document.createElement('span');
                badge.className = 'room-unread-badge' + (roomData.hasMention ? ' has-mention' : '');
                const regular = roomData.count - roomData.personalCount;
                badge.textContent = roomData.personalCount > 0
                    ? `${regular}@${roomData.personalCount}`
                    : String(roomData.count);
                htmlItem.appendChild(badge);
            }
        });
    }

    static updateTotalBadge(): void {
        let totalAll = 0;
        let totalPersonal = 0;

        for (const serverId in this.unreadCounts) {
            totalAll += this.unreadCounts[serverId].total || 0;
            totalPersonal += this.unreadCounts[serverId].personalTotal || 0;
        }

        const currentRoomTitle = document.querySelector('.current-room-title');
        if (currentRoomTitle) {
            const existingTitleBadge = currentRoomTitle.querySelector('.title-unread-badge');
            if (existingTitleBadge) existingTitleBadge.remove();
            if (totalAll > 0) {
                const badge = document.createElement('span');
                badge.className = 'title-unread-badge';
                const totalRegular = totalAll - totalPersonal;
                badge.textContent = totalPersonal > 0
                    ? `${totalRegular > 99 ? '99+' : totalRegular}@${totalPersonal > 99 ? '99+' : totalPersonal}`
                    : (totalAll > 99 ? '99+' : String(totalAll));
                currentRoomTitle.appendChild(badge);
            }
        }
    }

    static updateRoomTitleBadge(client: any): void {
        const titleElement = document.querySelector('.current-room-title');
        if (!titleElement) return;
        const existingBadge = titleElement.querySelector('.room-unread-badge');
        if (existingBadge) existingBadge.remove();
        if (!client || !client.currentRoom) return;

        const roomData = this.getRoomUnreadData(client.currentRoom);
        if (roomData && roomData.count > 0) {
            const badge = document.createElement('span');
            badge.className = 'room-unread-badge';
            const regular = roomData.count - roomData.personalCount;
            badge.textContent = roomData.personalCount > 0
                ? `${regular}@${roomData.personalCount}`
                : String(roomData.count);
            titleElement.appendChild(badge);
        }
    }

    static updateScrollButtonCounter(roomId: string): void {
        if (!roomId) return;
        const roomData = this.getRoomUnreadData(roomId);
        const btn = document.getElementById('scroll-to-bottom-btn');
        if (!btn) return;
        const existingCounter = btn.querySelector('.scroll-btn-counter');
        if (existingCounter) existingCounter.remove();
        const total = roomData?.count || 0;
        const personal = roomData?.personalCount || 0;
        if (total > 0) {
            const counter = document.createElement('span');
            counter.className = 'scroll-btn-counter';
            counter.style.cssText = 'position: absolute; top: -8px; right: -8px; background: #ed4245; color: white; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 10px; min-width: 18px; text-align: center; line-height: 1.2; border: 1px solid #2d2d44;';
            const regular = total - personal;
            counter.textContent = personal > 0 ? `${regular}@${personal}` : `${total}`;
            btn.style.position = 'relative';
            btn.appendChild(counter);
        }
    }

    static getRoomUnreadData(roomId: string): RoomUnreadData | null {
        if (!roomId) return null;
        for (const serverId in this.unreadCounts) {
            const roomData = this.unreadCounts[serverId].rooms?.[roomId];
            if (roomData) return roomData;
        }
        return null;
    }

    static setUnreadCount(serverId: string, roomId: string, count: number, hasMention: boolean, personalCount: number = 0): void {
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
        if (roomId === this.client?.currentRoom) {
            this.updateScrollButtonCounter(roomId);
        }
    }

    static clearUnreadForServer(serverId: string): void {
        if (this.unreadCounts[serverId]) {
            delete this.unreadCounts[serverId];
            this.updateServerBadges();
            this.updateRoomBadges();
            this.updateTotalBadge();
        }
    }

    static clearUnreadForRoom(serverId: string, roomId: string): void {
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
            if (roomId === this.client?.currentRoom) {
                this.updateScrollButtonCounter(roomId);
            }
        }
    }

    static clearAllUnread(): void {
        this.unreadCounts = {};
        this.updateServerBadges();
        this.updateRoomBadges();
        this.updateTotalBadge();
        if (this.client?.currentRoom) {
            this.updateScrollButtonCounter(this.client.currentRoom);
        }
    }

    static getSyncStatus(): SyncStatus {
        return {
            version: this.unreadVersion,
            lastSync: this.unreadLastSync,
            localTotal: this.getLocalUnreadTotal()
        };
    }

    static getLocalUnreadTotal(): number {
        let total = 0;
        for (const serverId in this.unreadCounts) {
            total += this.unreadCounts[serverId].total || 0;
        }
        return total;
    }
}

export default UnreadBadgeManager;
