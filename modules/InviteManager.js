import UIManager from './UIManager.js';

class InviteManager {
    static STORAGE_KEY = 'pending_invite';
    static INVITE_CODE_REGEX = /^[a-zA-Z0-9]{4,6}$/;
    static client = null;

    static init(client) {
        this.client = client;
        this.processUrlParams();
    }

    static processUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const inviteCode = params.get('invite');
        if (inviteCode && this.isValidInviteCode(inviteCode)) {
            this.setPendingInvite(inviteCode);
            this.cleanUrlParams();
        }
    }

    static isValidInviteCode(code) {
        return this.INVITE_CODE_REGEX.test(code);
    }

    static setPendingInvite(code) {
        localStorage.setItem(this.STORAGE_KEY, code);
    }

    static getPendingInvite() {
        return localStorage.getItem(this.STORAGE_KEY);
    }

    static clearPendingInvite() {
        localStorage.removeItem(this.STORAGE_KEY);
    }

    static cleanUrlParams() {
        const url = new URL(window.location);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url);
    }

    static async applyPendingInvite() {
        const inviteCode = this.getPendingInvite();

        if (!inviteCode || !this.client?.token) {
            return false;
        }

        try {
            const inviteInfo = await this.getInviteInfo(inviteCode);

            if (!inviteInfo) {
                this.clearPendingInvite();
                return false;
            }

            let success = false;

            if (inviteInfo.invite.targetType === 'server') {
                success = await this.joinServerByInvite(inviteInfo);
            } else if (
                inviteInfo.invite.targetType === 'room' ||
                inviteInfo.invite.targetType === 'private_room' ||
                inviteInfo.invite.targetInfo?.type === 'private_room'
            ) {
                success = await this.joinRoomByInvite(inviteInfo);
            }

            if (success) {
                this.clearPendingInvite();
                if (this.client) {
                    this.client.pendingInviteCode = null;
                }
                UIManager.addMessage('System', '✅ Присоединение по приглашению успешно');
            }

            return success;
        } catch (error) {
            UIManager.showError('Не удалось применить приглашение');
            this.clearPendingInvite();
            if (this.client) {
                this.client.pendingInviteCode = null;
            }
            return false;
        }
    }

    static async _apiRequest(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.client.token}`,
            ...(options.headers || {})
        };

        const response = await fetch(`${this.client.API_SERVER_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error: ${response.status}`);
        }

        return response.json();
    }

    static async getInviteInfo(inviteCode) {
        return this._apiRequest(`/api/invites/${inviteCode}`);
    }

    static async joinServerByInvite(inviteInfo) {
        try {
            const { invite } = inviteInfo;
            const serverExists = this.client.servers.some(s => s.id === invite.targetId);

            if (serverExists) {
                this.client.currentServerId = invite.targetId;
                UIManager.addMessage('System', `Вы уже присоединены к серверу "${invite.targetInfo.name}"`);
                return true;
            }

            const data = await this._apiRequest(`/api/servers/${invite.targetId}/join`, {
                method: 'POST',
                body: JSON.stringify({
                    userId: this.client.userId,
                    token: this.client.token
                })
            });

            const serverExistsInList = this.client.servers.some(s => s.id === data.server.id);
            if (!serverExistsInList) {
                this.client.servers.push(data.server);
            }

            this.client.currentServerId = data.server.id;
            this.client.currentServer = data.server;
            UIManager.addMessage('System', `✅ Вы присоединились к серверу "${data.server.name}" по приглашению`);

            const RoomManager = (await import('./RoomManager.js')).default;
            await RoomManager.loadRoomsForServer(this.client, data.server.id);

            return true;
        } catch (error) {
            UIManager.showError(`Не удалось присоединиться к серверу: ${error.message}`);
            return false;
        }
    }

    static async joinRoomByInvite(inviteInfo) {
        try {
            const { invite } = inviteInfo;
            const isPrivateRoom =
                invite.targetInfo?.type === 'private_room' ||
                invite.targetType === 'private_room' ||
                !invite.targetInfo?.serverId;

            if (isPrivateRoom) {
                if (!this.client) {
                    throw new Error('Client not initialized');
                }
                if (this.client.currentRoom === invite.targetId) {
                    UIManager.addMessage('System', 'Вы уже в комнате');
                    return true;
                }
                await this.client.joinRoom(invite.targetId);
                UIManager.addMessage('System', '✅ Вы присоединились к приватной комнате по приглашению');
                return true;
            }

            if (!invite.targetInfo || !invite.targetInfo.serverId) {
                throw new Error('Недостаточно информации о комнате в приглашении');
            }

            const serverId = invite.targetInfo.serverId;
            const serverExists = this.client.servers.some(s => s.id === serverId);

            if (!serverExists) {
                const serverJoinSuccess = await this.joinServerByInvite({
                    invite: {
                        ...invite,
                        targetId: serverId,
                        targetType: 'server',
                        targetInfo: { name: invite.targetInfo.serverName }
                    }
                });
                if (!serverJoinSuccess) {
                    throw new Error('Не удалось присоединиться к серверу комнаты');
                }
            }

            this.client.currentServerId = serverId;
            this.client.currentRoom = invite.targetId;

            const RoomManager = (await import('./RoomManager.js')).default;
            await RoomManager.loadRoomsForServer(this.client, serverId);
            await RoomManager.joinRoom(this.client, invite.targetId);

            UIManager.addMessage('System', `✅ Вы присоединились к комнате "${invite.targetInfo.name}" по приглашению`);
            return true;
        } catch (error) {
            UIManager.showError('Не удалось присоединиться к комнате: ' + error.message);
            return false;
        }
    }

    static async _createInvite(targetId, targetType, expiresInHours = 168) {
        const data = await this._apiRequest('/api/invites', {
            method: 'POST',
            body: JSON.stringify({
                targetId,
                targetType,
                expiresInHours
            })
        });
        return data.invite;
    }

    static async createServerInvite(serverId, expiresInHours = 168) {
        try {
            return await this._createInvite(serverId, 'server', expiresInHours);
        } catch (error) {
            throw error;
        }
    }

    static async createRoomInvite(roomId, expiresInHours = 168) {
        try {
            return await this._createInvite(roomId, 'room', expiresInHours);
        } catch (error) {
            throw error;
        }
    }

    static async _getInvites(targetId, targetType) {
        const endpoint = targetType === 'server'
            ? `/api/servers/${targetId}/invites`
            : `/api/rooms/${targetId}/invites`;
        
        const data = await this._apiRequest(endpoint);
        return data.invites;
    }

    static async getServerInvites(serverId) {
        try {
            return await this._getInvites(serverId, 'server');
        } catch (error) {
            throw error;
        }
    }

    static async getRoomInvites(roomId) {
        try {
            return await this._getInvites(roomId, 'room');
        } catch (error) {
            throw error;
        }
    }

    static generateInviteLink(code) {
        return `https://ns.fiber-gate.ru/${code}`;
    }

    static copyInviteLink(code) {
        const link = this.generateInviteLink(code);
        navigator.clipboard.writeText(link)
            .then(() => {
                UIManager.addMessage('System', 'Ссылка скопирована в буфер обмена');
            })
            .catch(() => {
                UIManager.showError('Не удалось скопировать ссылку');
            });
    }
}

export default InviteManager;
