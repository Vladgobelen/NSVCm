import UIManager from './UIManager.js';
import RoomManager from './RoomManager.js';
import InviteManager from './InviteManager.js';

class ServerManager {
    static async loadServers(client, forceUpdate = false) {
        try {
            let apiServers = [];
            try {
                const res = await fetch(`${client.API_SERVER_URL}/api/servers`, {
                    headers: {
                        'Authorization': `Bearer ${client.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    apiServers = Array.isArray(data.servers) ? data.servers : [];
                } else {
                    UIManager.showError('Не удалось загрузить деревья');
                    return false;
                }
            } catch (apiError) {
                UIManager.showError('Не удалось загрузить деревья');
                return false;
            }

            client.servers = [...apiServers];
            const lastServerId = localStorage.getItem('lastServerId');
            if (lastServerId) {
                const serverExists = client.servers.some(s => s.id === lastServerId);
                if (serverExists) {
                    client.currentServerId = lastServerId;
                    client.currentServer = client.servers.find(s => s.id === lastServerId);
                } else {
                    localStorage.removeItem('lastServerId');
                    localStorage.removeItem('lastRoomId');
                }
            }
            this.renderServers(client);
            return true;
        } catch (error) {
            UIManager.showError('Не удалось загрузить деревья: ' + error.message);
            return false;
        }
    }

    static isPrivateServer(server) {
        return server?.type === 'private' ||
               server?.isPrivate === true ||
               (server?.id && server.id.startsWith('user_') && server.id.includes('_user_'));
    }

    static getPrivateServerDisplayName(server, clientUserId) {
        if (!server || !server.id) {
            return server?.name || 'Приватный чат';
        }
        if (!this.isPrivateServer(server)) {
            return server.name;
        }
        if (server.displayName) {
            return server.displayName;
        }
        let otherUserId = null;
        if (server.participantIds && Array.isArray(server.participantIds)) {
            otherUserId = server.participantIds.find(id => id !== clientUserId);
        }
        if (!otherUserId && server.members && Array.isArray(server.members)) {
            otherUserId = server.members.find(id => id !== clientUserId);
        }
        if (!otherUserId) {
            const parts = server.id.split('_user_');
            if (parts.length === 2) {
                otherUserId = clientUserId === parts[0] ? parts[1] : parts[0];
                if (!otherUserId.startsWith('user_')) {
                    otherUserId = 'user_' + otherUserId;
                }
            }
        }
        if (otherUserId) {
            const cachedName = UIManager.usernameCache.get(otherUserId);
            if (cachedName) {
                return cachedName;
            }
            return otherUserId.replace('user_', '').substring(0, 8);
        }
        return server.name || 'Приватный чат';
    }

    static renderServers(client) {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) return;
        serversList.innerHTML = '';
        if (client.servers.length === 0) {
            serversList.innerHTML = '<div class="no-results">Нет деревьев. Посадите новое или присоединитесь к существующему.</div>';
            return;
        }
        client.servers.forEach(server => {
            const serverElement = document.createElement('div');
            serverElement.className = 'server-item';
            serverElement.dataset.server = server.id;
            const isPrivate = this.isPrivateServer(server);
            const displayName = isPrivate
                ? `👤 ${this.getPrivateServerDisplayName(server, client.userId)}`
                : `🏠 ${server.name}`;
            const isOwner = server.ownerId === client.userId;
            serverElement.innerHTML = `${displayName} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''}`;
            serverElement.addEventListener('click', () => {
                client.currentServerId = server.id;
                client.currentServer = server;
                localStorage.setItem('lastServerId', server.id);
                if (client.serverSearchInput) {
                    client.serverSearchInput.value = '';
                }
                setTimeout(() => {
                    RoomManager.loadRoomsForServer(client, server.id);
                    client.showPanel('rooms');
                    UIManager.updateServerBadges();
                    UIManager.updateRoomBadges();
                }, 100);
            });
            const actionButtons = document.createElement('div');
            actionButtons.className = 'server-actions';
            if (isPrivate) {
                const shareBtn = document.createElement('button');
                shareBtn.className = 'server-action-btn';
                shareBtn.innerHTML = '📋';
                shareBtn.title = 'Скопировать ссылку на чат';
                shareBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const inviteLink = `https://ns.fiber-gate.ru/${server.inviteCode || ''}`;
                        await navigator.clipboard.writeText(inviteLink);
                        UIManager.showError('Ссылка скопирована!');
                    } catch (err) {
                        UIManager.showError('Не удалось скопировать ссылку');
                    }
                });
                actionButtons.appendChild(shareBtn);
            } else {
                if (isOwner) {
                    const shareBtn = document.createElement('button');
                    shareBtn.className = 'server-action-btn';
                    shareBtn.innerHTML = '📋';
                    shareBtn.title = 'Скопировать ссылку';
                    shareBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.copyServerInviteLink(client, server.id);
                    });
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'server-action-btn';
                    deleteBtn.innerHTML = '✕';
                    deleteBtn.title = 'Срубить';
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteServer(client, server.id);
                    });
                    actionButtons.appendChild(shareBtn);
                    actionButtons.appendChild(deleteBtn);
                } else if (server.members?.includes(client.userId)) {
                    const leaveBtn = document.createElement('button');
                    leaveBtn.className = 'server-action-btn leave-btn';
                    leaveBtn.innerHTML = '🚪';
                    leaveBtn.title = 'Покинуть дерево';
                    leaveBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.leaveServer(client, server.id);
                    });
                    actionButtons.appendChild(leaveBtn);
                }
            }
            serverElement.appendChild(actionButtons);
            serversList.appendChild(serverElement);
        });
        UIManager.updateServerBadges();
    }

    static async createDirectRoom(client, targetUserId, targetUsername) {
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/rooms/private/${targetUserId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Не удалось создать прямой чат');
            }
            const data = await res.json();
            const room = data.room;
            const server = data.server;
            const directStub = {
                id: server.id,
                name: targetUsername,
                displayName: targetUsername,
                type: 'private',
                serverId: server.id,
                ownerId: client.userId,
                targetUserId: targetUserId,
                participants: [client.userId, targetUserId],
                participantIds: [client.userId, targetUserId],
                members: [client.userId, targetUserId],
                inviteCode: room.inviteCode || room.code || '',
                isPrivate: true
            };
            if (!client.servers.some(s => s.id === server.id)) {
                client.servers.push(directStub);
            }
            if (room.inviteCode) {
                const link = `https://ns.fiber-gate.ru/${room.inviteCode}`;
                await navigator.clipboard.writeText(link);
                UIManager.showError(`Прямой чат создан! Ссылка: ${link}`);
            } else {
                UIManager.showError(`Прямой чат создан!`);
            }
            client.currentServerId = server.id;
            client.currentServer = directStub;
            localStorage.setItem('lastServerId', server.id);
            client.showPanel('servers');
            this.renderServers(client);
            await new Promise(resolve => setTimeout(resolve, 500));
            let joinSuccess = false;
            let attempts = 0;
            const maxAttempts = 3;
            while (!joinSuccess && attempts < maxAttempts) {
                try {
                    await client.joinRoom(room.id);
                    joinSuccess = true;
                } catch (joinError) {
                    attempts++;
                    if (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
                    } else {
                        throw joinError;
                    }
                }
            }
        } catch (error) {
            UIManager.showError('Ошибка: ' + error.message);
        }
    }

    static async createServer(client) {
        const name = prompt('Назовите дерево:');
        if (!name || name.length < 3) {
            UIManager.showError('Название должно быть от 3 символов');
            return;
        }
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/servers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    name: name.trim(),
                    userId: client.userId,
                    token: client.token
                })
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const errorMessage = errorData.error || 'Не удалось посадить дерево';
                if (errorMessage.includes('уже существует')) {
                    UIManager.showError(`Ошибка: ${errorMessage}. Выберите другое название.`);
                } else if (errorMessage.includes('Превышен лимит')) {
                    UIManager.showError(`Ошибка: ${errorMessage}`);
                } else {
                    throw new Error(errorMessage);
                }
                return;
            }
            const data = await res.json();
            const serverData = data.server;
            client.servers.push(serverData);
            this.renderServers(client);
            client.currentServerId = serverData.id;
            client.currentServer = serverData;
            localStorage.setItem('lastServerId', serverData.id);
            await RoomManager.loadRoomsForServer(client, client.currentServerId);
        } catch (error) {
            UIManager.showError('Ошибка: ' + error.message);
        }
    }

    static async deleteServer(client, serverId) {
        if (!confirm('Вы уверены, что хотите срубить это дерево? Все гнёзда будут разорены.')) return;
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/servers/${serverId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Не удалось срубить дерево');
            }
            const serverIndex = client.servers.findIndex(s => s.id === serverId);
            if (serverIndex !== -1) {
                const serverName = client.servers[serverIndex].name;
                client.servers = client.servers.filter(server => server.id !== serverId);
                this.renderServers(client);
                if (client.currentServerId === serverId) {
                    client.currentServerId = null;
                    client.currentServer = null;
                    localStorage.removeItem('lastServerId');
                    localStorage.removeItem('lastRoomId');
                }
                UIManager.addMessage('System', `✅ Дерево "${serverName}" срублено`);
            }
        } catch (error) {
            UIManager.showError('Ошибка: ' + error.message);
        }
    }

    static async searchServers(client, query) {
        try {
            if (!query || query.length < 2) {
                this.renderServers(client);
                return;
            }
            const response = await fetch(`${client.API_SERVER_URL}/api/servers/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.renderSearchResults(client, {
                servers: data.servers || [],
                users: data.users || []
            });
        } catch (error) {
            UIManager.showError('Ошибка поиска: ' + error.message);
        }
    }

    static renderSearchResults(client, { servers, users }) {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) return;
        serversList.innerHTML = '';
        if (servers.length === 0 && users.length === 0) {
            serversList.innerHTML = '<div class="no-results">Ничего не найдено</div>';
            return;
        }
        servers.forEach(server => {
            if (!server || !server.id) return;
            const serverElement = document.createElement('div');
            serverElement.className = 'server-item';
            serverElement.dataset.server = server.id;
            const isOwner = server.ownerId === client.userId;
            const isMember = client.servers.some(s => s && s.id && s.id === server.id);
            serverElement.innerHTML = `🏠 ${server.name} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''} ${!isMember ? '<span class="not-member-badge">(Не участник)</span>' : ''}`;
            if (isMember) {
                serverElement.addEventListener('click', () => {
                    client.currentServerId = server.id;
                    client.currentServer = server;
                    localStorage.setItem('lastServerId', server.id);
                    if (client.serverSearchInput) client.serverSearchInput.value = '';
                    setTimeout(() => {
                        RoomManager.loadRoomsForServer(client, server.id);
                        client.showPanel('rooms');
                    }, 100);
                });
            } else {
                serverElement.style.opacity = '0.7';
                const joinBtn = document.createElement('button');
                joinBtn.className = 'server-action-btn join-btn';
                joinBtn.innerHTML = '➕';
                joinBtn.title = 'Присоединиться';
                joinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.joinServer(client, server.id);
                });
                serverElement.appendChild(joinBtn);
            }
            serversList.appendChild(serverElement);
        });
        users.forEach(user => {
            if (!user || !user.userId) return;
            if (String(user.userId) === String(client.userId)) return;
            const hasDirectRoom = client.servers.some(s => {
                if (!s || !s.id) return false;
                const isDirectFormat = s.id.startsWith('user_') && s.id.split('_user_').length === 2;
                if (!isDirectFormat) return false;
                return s.id.includes(user.userId);
            });
            if (hasDirectRoom) return;
            const userElement = document.createElement('div');
            userElement.className = 'server-item';
            userElement.innerHTML = `👤 ${user.username}`;
            const createBtn = document.createElement('button');
            createBtn.className = 'server-action-btn join-btn';
            createBtn.innerHTML = '➕';
            createBtn.title = `Начать прямой чат с ${user.username}`;
            createBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.createDirectRoom(client, user.userId, user.username);
            });
            userElement.appendChild(createBtn);
            serversList.appendChild(userElement);
        });
    }

    static async joinServer(client, serverId) {
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/servers/${serverId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    userId: client.userId,
                    token: client.token
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Не удалось присоединиться');
            }
            const data = await res.json();
            const server = data.server;
            const exists = client.servers.some(s => s.id === server.id);
            if (!exists) {
                client.servers.push(server);
            }
            if (client.serverSearchInput) {
                client.serverSearchInput.value = '';
            }
            localStorage.setItem('lastServerId', server.id);
            this.renderServers(client);
            client.showPanel('servers');
            UIManager.addMessage('System', `✅ Вы присоединились к дереву "${server.name}"`);
        } catch (error) {
            UIManager.showError(`❌ Не удалось присоединиться: ${error.message}`);
        }
    }

    static async leaveServer(client, serverId) {
        if (!confirm('Вы уверены, что хотите покинуть это дерево?')) return;
        try {
            const res = await fetch(`${client.API_SERVER_URL}/api/servers/${serverId}/leave`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Не удалось покинуть дерево');
            }
            client.servers = client.servers.filter(server => server.id !== serverId);
            if (client.currentServerId === serverId) {
                client.currentServerId = null;
                client.currentServer = null;
                client.currentRoom = null;
                localStorage.removeItem('lastServerId');
                localStorage.removeItem('lastRoomId');
            }
            this.renderServers(client);
            UIManager.addMessage('System', `✅ Вы покинули дерево`);
        } catch (error) {
            UIManager.showError('Ошибка: ' + error.message);
        }
    }

    static clearSearchAndShowAllServers(client) {
        if (client.serverSearchInput) {
            client.serverSearchInput.value = '';
        }
        this.loadServers(client, true);
    }

    static async copyServerInviteLink(client, serverId) {
        try {
            const server = client.servers.find(s => s.id === serverId);
            const isPrivateRoom = this.isPrivateServer(server);
            let invite;
            if (isPrivateRoom) {
                const invites = await InviteManager.getRoomInvites(serverId);
                if (invites && invites.length > 0) {
                    const activeInvite = invites.find(inv => new Date(inv.expiresAt) > new Date());
                    if (activeInvite) {
                        InviteManager.copyInviteLink(activeInvite.code);
                        return;
                    }
                }
                invite = await InviteManager.createRoomInvite(serverId);
            } else {
                const invites = await InviteManager.getServerInvites(serverId);
                if (invites && invites.length > 0) {
                    const activeInvite = invites.find(inv => new Date(inv.expiresAt) > new Date());
                    if (activeInvite) {
                        InviteManager.copyInviteLink(activeInvite.code);
                        return;
                    }
                }
                invite = await InviteManager.createServerInvite(serverId);
            }
            if (invite) {
                InviteManager.copyInviteLink(invite.code);
            }
        } catch (error) {
            UIManager.showError('Не удалось скопировать ссылку приглашения');
        }
    }
}

export default ServerManager;
