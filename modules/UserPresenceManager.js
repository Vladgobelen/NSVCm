import UIManager from './UIManager.js';

class UserPresenceManager {
    static PRESENCE_UPDATE_INTERVAL = 30000;
    static INACTIVITY_TIMEOUT = 300000;
    static client = null;
    static lastActivityTime = 0;
    static isUserActive = false;
    static presenceInterval = null;

    static init(client) {
        this.client = client;
        this.lastActivityTime = Date.now();
        this.setupActivityTracking();
        this.startPresenceUpdates();
    }

    static setupActivityTracking() {
        const activityEvents = [
            'mousedown', 'mousemove', 'keypress',
            'scroll', 'touchstart', 'click',
            'message', 'mic-state-change'
        ];

        activityEvents.forEach(event => {
            document.addEventListener(event, () => {
                this.updateLastActivity();
            }, { passive: true });
        });

        const originalAddMessage = UIManager.addMessage;
        UIManager.addMessage = function(...args) {
            originalAddMessage.apply(this, args);
            UserPresenceManager.updateLastActivity();
        };
    }

    static updateLastActivity() {
        this.lastActivityTime = Date.now();
        if (!this.isUserActive && this.client.userId) {
            this.setUserActive(true);
        }
    }

    static async setUserActive(isActive) {
        if (!this.client.userId || !this.client.token) return;
        this.isUserActive = isActive;

        try {
            await this._sendPresenceUpdate({
                isOnline: isActive,
                currentRoom: this.client.currentRoom,
                lastActivity: new Date().toISOString()
            });
        } catch (error) {
            console.error('Ошибка обновления статуса:', error);
        }
    }

    static async _sendPresenceUpdate(payload) {
        if (!this.client.token) return;
        const response = await fetch(`${this.client.API_SERVER_URL}/api/presence/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.client.token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Ошибка обновления присутствия');
        }
    }

    static startPresenceUpdates() {
        this.presenceInterval = setInterval(() => {
            this.checkActivity();
            this.updatePresence();
        }, this.PRESENCE_UPDATE_INTERVAL);

        const originalJoinRoom = this.client.joinRoom;
        this.client.joinRoom = async (...args) => {
            const result = await originalJoinRoom.apply(this.client, args);
            if (result) {
                this.updatePresence();
            }
            return result;
        };

        const originalLeaveRoom = this.client.leaveRoom;
        this.client.leaveRoom = async (...args) => {
            const result = await originalLeaveRoom.apply(this.client, args);
            if (result) {
                this.updatePresence();
            }
            return result;
        };
    }

    static checkActivity() {
        const currentTime = Date.now();
        const inactiveTime = currentTime - this.lastActivityTime;
        const shouldBeOnline = this.client.currentRoom !== null;

        if (shouldBeOnline !== this.isUserActive) {
            this.setUserActive(shouldBeOnline);
        }
    }

    static async updatePresence() {
        if (!this.client.userId || !this.client.token) return;
        try {
            await this._sendPresenceUpdate({
                currentRoom: this.client.currentRoom,
                isMicActive: this.client.isMicActive,
                lastActivity: new Date().toISOString()
            });
        } catch (error) {
            console.error('Ошибка обновления присутствия:', error);
        }
    }

    static async _getAuthenticated(url) {
        if (!this.client.token) return null;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.client.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка запроса');
        }
        return await response.json();
    }

    static async getOnlineUsers(roomId = null) {
        try {
            let url = `${this.client.API_SERVER_URL}/api/presence/online-users`;
            if (roomId) {
                url += `?roomId=${roomId}`;
            }

            const data = await this._getAuthenticated(url);
            return data.users || [];
        } catch (error) {
            console.error('Ошибка получения онлайн пользователей:', error);
            return [];
        }
    }

    static async getUserPresence(userId) {
        if (!this.client.token) return { isOnline: false, lastSeen: null };

        try {
            const data = await this._getAuthenticated(`${this.client.API_SERVER_URL}/api/presence/user/${userId}`);
            return data;
        } catch (error) {
            console.error('Ошибка получения статуса пользователя:', error);
            return { isOnline: false, lastSeen: null };
        }
    }

    static async subscribeToPresenceUpdates(roomId) {
        if (!this.client.socket || !roomId) return;

        this.client.socket.emit('subscribe-presence', { roomId });

        this.client.socket.on('presence-update', (data) => {
            this.handlePresenceUpdate(data);
        });

        this.client.socket.on('user-joined', (data) => {
            this.handleUserJoined(data);
        });

        this.client.socket.on('user-left', (data) => {
            this.handleUserLeft(data);
        });
    }

    static handlePresenceUpdate(data) {
        const { userId, isOnline, isMicActive, lastSeen } = data;
        UIManager.updateUserPresence(userId, {
            isOnline,
            isMicActive,
            lastSeen: lastSeen ? new Date(lastSeen) : null
        });
    }

    static handleUserJoined(data) {
        const { userId, username, isMicActive } = data;
        UIManager.addUser({
            userId,
            username,
            isMicActive: isMicActive || false,
            isOnline: true
        });
        UIManager.addMessage('System', `Пользователь ${username} присоединился`, new Date().toISOString());
    }

    static handleUserLeft(data) {
        const { userId, username } = data;
        UIManager.updateUserPresence(userId, {
            isOnline: false,
            isMicActive: false,
            lastSeen: new Date().toISOString()
        });
        UIManager.addMessage('System', `Пользователь ${username} покинул чат`, new Date().toISOString());
    }

    static async updateMicState(isActive) {
        if (!this.client.userId || !this.client.token) return;
        this.client.isMicActive = isActive;

        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/presence/mic-state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.client.token}`
                },
                body: JSON.stringify({
                    isActive: isActive,
                    roomId: this.client.currentRoom
                })
            });

            if (!response.ok) {
                throw new Error('Ошибка обновления статуса микрофона');
            }

            if (this.client.socket && this.client.currentRoom) {
                this.client.socket.emit('mic-state-change', {
                    isActive: isActive,
                    roomId: this.client.currentRoom
                });
            }
        } catch (error) {
            console.error('Ошибка обновления статуса микрофона:', error);
        }
    }

    static cleanup() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
        }
        if (this.client.userId) {
            this.setUserActive(false);
        }
    }
}

export default UserPresenceManager;
