import UIManager from './UIManager.js';

class InviteManager {
    static STORAGE_KEY = 'pending_invite';
    // ✅ ИСПРАВЛЕНО: поддержка кодов от 4 до 6 символов (было {4})
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

// В InviteManager.js, метод applyPendingInvite()
static async applyPendingInvite() {
    // ✅ Получаем код из localStorage (единый источник истины)
    const inviteCode = this.getPendingInvite();
    
    console.log('🔍 [INVITE] applyPendingInvite called');
    console.log('🔍 [INVITE] inviteCode from storage:', inviteCode);
    console.log('🔍 [INVITE] this.client:', !!this.client);
    console.log('🔍 [INVITE] this.client?.token:', !!this.client?.token);
    
    if (!inviteCode || !this.client?.token) {
        console.warn('⚠️ [INVITE] Missing code or token, returning false');
        return false;
    }
    
    try {
        console.log('🔍 [INVITE] Fetching invite info for code:', inviteCode);
        const inviteInfo = await this.getInviteInfo(inviteCode);
        
        if (!inviteInfo) {
            console.warn('⚠️ [INVITE] No invite info, clearing pending invite');
            this.clearPendingInvite();
            return false;
        }
        
        console.log('✅ [INVITE] Invite info received:', JSON.stringify(inviteInfo, null, 2));
        
        let success = false;
        
        if (inviteInfo.invite.targetType === 'server') {
            console.log('🔍 [INVITE] Processing as SERVER invite');
            success = await this.joinServerByInvite(inviteInfo);
        } else if (inviteInfo.invite.targetType === 'room' ||
                   inviteInfo.invite.targetType === 'private_room' ||
                   inviteInfo.invite.targetInfo?.type === 'private_room') {
            console.log('🔍 [INVITE] Processing as ROOM/Private invite');
            console.log('🔍 [INVITE] targetId:', inviteInfo.invite.targetId);
            success = await this.joinRoomByInvite(inviteInfo);
        } else {
            console.warn('⚠️ [INVITE] Unknown targetType:', inviteInfo.invite.targetType);
        }
        
        if (success) {
            console.log('✅ [INVITE] Invite applied successfully, clearing pending');
            this.clearPendingInvite();
            // ✅ Также очищаем в VoiceChatClient
            if (this.client) {
                this.client.pendingInviteCode = null;
            }
            UIManager.addMessage('System', `✅ Присоединение по приглашению успешно`);
        } else {
            console.warn('⚠️ [INVITE] Invite application returned false');
        }
        
        return success;
    } catch (error) {
        console.error('❌ [INVITE] Error applying invite:', error);
        UIManager.showError('Не удалось применить приглашение');
        this.clearPendingInvite();
        if (this.client) {
            this.client.pendingInviteCode = null;
        }
        return false;
    }
}

    static async getInviteInfo(inviteCode) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/invites/${inviteCode}`, {
                headers: {
                    'Authorization': `Bearer ${this.client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Ошибка получения информации об инвайте:', error);
            throw error;
        }
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
            const response = await fetch(`${this.client.API_SERVER_URL}/api/servers/${invite.targetId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.client.token}`
                },
                body: JSON.stringify({
                    userId: this.client.userId,
                    token: this.client.token
                })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Ошибка присоединения: ${response.status}`);
            }
            const data = await response.json();
            const serverExistsInList = this.client.servers.some(s => s.id === data.server.id);
            if (!serverExistsInList) {
                this.client.servers.push(data.server);
            }
            this.client.currentServerId = data.server.id;
            this.client.currentServer = data.server;
            UIManager.addMessage('System', `✅ Вы присоединились к серверу "${data.server.name}" по приглашению`);
            const RoomManager = await import('./RoomManager.js').then(module => module.default);
            await RoomManager.loadRoomsForServer(this.client, data.server.id);
            return true;
        } catch (error) {
            console.error('Ошибка присоединения к серверу по инвайту:', error);
            UIManager.showError(`Не удалось присоединиться к серверу: ${error.message}`);
            return false;
        }
    }

    static async joinRoomByInvite(inviteInfo) {
        try {
            const { invite } = inviteInfo;
            // ✅ ОПРЕДЕЛЕНИЕ ТИПА КОМНАТЫ
            const isPrivateRoom = invite.targetInfo?.type === 'private_room' ||
                                 invite.targetType === 'private_room' ||
                                 !invite.targetInfo?.serverId;
            
            if (isPrivateRoom) {
                // ✅ Приватная комната — прямой вход
                if (!this.client) {
                    throw new Error('Client not initialized');
                }
                if (this.client.currentRoom === invite.targetId) {
                    UIManager.addMessage('System', `Вы уже в комнате`);
                    return true;
                }
                await this.client.joinRoom(invite.targetId);
                UIManager.addMessage('System', `✅ Вы присоединились к приватной комнате по приглашению`);
                return true;
            }
            
            // ✅ Обычная комната на сервере
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
            const RoomManager = await import('./RoomManager.js').then(module => module.default);
            await RoomManager.loadRoomsForServer(this.client, serverId);
            await RoomManager.joinRoom(this.client, invite.targetId);
            UIManager.addMessage('System', `✅ Вы присоединились к комнате "${invite.targetInfo.name}" по приглашению`);
            return true;
        } catch (error) {
            console.error('Ошибка присоединения к комнате по инвайту:', error);
            UIManager.showError('Не удалось присоединиться к комнате: ' + error.message);
            return false;
        }
    }

    static async createServerInvite(serverId, expiresInHours = 168) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/invites`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.client.token}`
                },
                body: JSON.stringify({
                    targetId: serverId,
                    targetType: 'server',
                    expiresInHours
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            const data = await response.json();
            return data.invite;
        } catch (error) {
            console.error('Ошибка создания инвайта сервера:', error);
            throw error;
        }
    }

    static async createRoomInvite(roomId, expiresInHours = 168) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/invites`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.client.token}`
                },
                body: JSON.stringify({
                    targetId: roomId,
                    targetType: 'room',
                    expiresInHours
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            const data = await response.json();
            return data.invite;
        } catch (error) {
            console.error('Ошибка создания инвайта комнаты:', error);
            throw error;
        }
    }

    static async getServerInvites(serverId) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/servers/${serverId}/invites`, {
                headers: {
                    'Authorization': `Bearer ${this.client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            const data = await response.json();
            return data.invites;
        } catch (error) {
            console.error('Ошибка получения инвайтов сервера:', error);
            throw error;
        }
    }

    static async getRoomInvites(roomId) {
        try {
            const response = await fetch(`${this.client.API_SERVER_URL}/api/rooms/${roomId}/invites`, {
                headers: {
                    'Authorization': `Bearer ${this.client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            const data = await response.json();
            return data.invites;
        } catch (error) {
            console.error('Ошибка получения инвайтов комнаты:', error);
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
                UIManager.showError('Ссылка скопирована в буфер обмена');
            })
            .catch(err => {
                console.error('Ошибка копирования ссылки:', err);
                UIManager.showError('Не удалось скопировать ссылку');
            });
    }
}

export default InviteManager;
