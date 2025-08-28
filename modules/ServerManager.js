import UIManager from './UIManager.js';
import RoomManager from './RoomManager.js';

class ServerManager {
    static getLocalStorageKey(client) {
        return client.userId ? `voiceChatServers_${client.userId}` : null;
    }

    static saveServersToLocalStorage(client) {
        if (!client.userId) return;
        const key = this.getLocalStorageKey(client);
        const serversData = {
            servers: client.servers,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(serversData));
    }

    static loadServersFromLocalStorage(client) {
        if (!client.userId) return [];
        const key = this.getLocalStorageKey(client);
        const data = localStorage.getItem(key);
        if (data) {
            try {
                const serversData = JSON.parse(data);
                return serversData.servers || [];
            } catch (e) {
                console.error('Ошибка при парсинге данных серверов из localStorage', e);
                return [];
            }
        }
        return [];
    }

    static async loadServers(client) {
        try {
            let servers = [];
            
            try {
                const res = await fetch(`${client.API_SERVER_URL}/api/servers`, {
                    headers: { 'Authorization': `Bearer ${client.token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    servers = Array.isArray(data.servers) ? data.servers : [];
                }
            } catch (apiError) {
                console.warn('Ошибка загрузки с API, используем localStorage', apiError);
            }
            
            if (servers.length === 0) {
                servers = this.loadServersFromLocalStorage(client);
            }
            
            client.servers = servers;
            this.renderServers(client);
            return true;
        } catch (error) {
            console.error('Ошибка загрузки серверов:', error);
            return false;
        }
    }

    static renderServers(client) {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) return;

        serversList.innerHTML = '';
        
        client.servers.forEach(server => {
            const serverElement = document.createElement('div');
            serverElement.className = 'server-item';
            serverElement.dataset.server = server.id;
            
            const isOwner = server.ownerId === client.userId;
            serverElement.innerHTML = `🏠 ${server.name} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''}`;
            
            serverElement.addEventListener('click', () => {
                client.currentServerId = server.id;
                client.currentServer = server;
                RoomManager.loadRoomsForServer(client, server.id);
                client.showPanel('rooms');
            });
            
            if (isOwner) {
                const shareBtn = document.createElement('button');
                shareBtn.className = 'server-action-btn';
                shareBtn.innerHTML = '🔗';
                shareBtn.title = 'Пригласить';
                shareBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${server.id}`;
                    navigator.clipboard.writeText(inviteLink)
                        .then(() => alert(`Ссылка скопирована: ${inviteLink}`))
                        .catch(err => console.error('Не удалось скопировать:', err));
                });
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'server-action-btn';
                deleteBtn.innerHTML = '✕';
                deleteBtn.title = 'Удалить';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteServer(client, server.id);
                });
                
                serverElement.appendChild(shareBtn);
                serverElement.appendChild(deleteBtn);
            }
            
            serversList.appendChild(serverElement);
        });
    }

    static async createServer(client) {
        const name = prompt('Введите название сервера:');
        if (!name || name.length < 3) {
            alert('Название должно быть от 3 символов');
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
            
            let serverData;
            if (res.ok) {
                const data = await res.json();
                serverData = data.server;
            } else {
                const serverId = 'server_' + Math.random().toString(36).substr(2, 9);
                serverData = {
                    id: serverId,
                    name: name.trim(),
                    ownerId: client.userId,
                    createdAt: new Date().toISOString()
                };
            }
            
            client.servers.push(serverData);
            this.saveServersToLocalStorage(client);
            this.renderServers(client);
            client.currentServerId = serverData.id;
            client.currentServer = serverData;
            
            await RoomManager.loadRoomsForServer(client, client.currentServerId);
            
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    }

    static deleteServer(client, serverId) {
        if (!confirm('Вы уверены, что хотите удалить этот сервер? Все комнаты будут удалены.')) return;
        const serverIndex = client.servers.findIndex(s => s.id === serverId);
        if (serverIndex !== -1) {
            const serverName = client.servers[serverIndex].name;
            client.servers = client.servers.filter(server => server.id !== serverId);
            this.saveServersToLocalStorage(client);
            this.renderServers(client);
            if (client.currentServerId === serverId) {
                client.currentServerId = null;
                client.currentServer = null;
            }
        }
    }
}

export default ServerManager;
