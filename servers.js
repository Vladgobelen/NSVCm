// servers.js (исправленный)
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
        console.log('[SERVERS] Серверы сохранены в localStorage');
    }

    static loadServersFromLocalStorage(client) {
        if (!client.userId) return [];
        const key = this.getLocalStorageKey(client);
        const data = localStorage.getItem(key);
        if (data) {
            try {
                const serversData = JSON.parse(data);
                console.log('[SERVERS] Загружены серверы из localStorage:', serversData.servers);
                return serversData.servers || [];
            } catch (e) {
                console.error('[SERVERS] Ошибка при парсинге данных серверов из localStorage', e);
                return [];
            }
        }
        console.log('[SERVERS] Нет сохраненных серверов в localStorage');
        return [];
    }

    static async loadServers(client) {
        try {
            UIManager.updateStatus(client, 'Загрузка серверов...', 'connecting');
            let servers = [];
            
            // Загрузка с сервера
            try {
                const res = await fetch(`${client.API_SERVER_URL}/api/servers`, {
                    headers: { 'Authorization': `Bearer ${client.token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    servers = Array.isArray(data.servers) ? data.servers : [];
                    console.log('[SERVERS] Серверы загружены с API:', servers);
                }
            } catch (apiError) {
                console.warn('[SERVERS] Ошибка загрузки с API, используем localStorage', apiError);
            }
            
            // Если с сервера не загрузилось, используем localStorage
            if (servers.length === 0) {
                servers = this.loadServersFromLocalStorage(client);
            }
            
            client.servers = servers;
            ServerManager.renderServers(client);
            UIManager.updateStatus(client, 'Серверы загружены', 'normal');
            return true;
        } catch (error) {
            UIManager.addMessage(client, 'System', `Ошибка загрузки серверов: ${error.message}`);
            UIManager.updateStatus(client, 'Ошибка загрузки серверов', 'disconnected');
            return false;
        }
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
                console.warn('[SERVERS] Используем локальный объект сервера');
            }
            
            client.servers.push(serverData);
            this.saveServersToLocalStorage(client);
            UIManager.addMessage(client, 'System', `Сервер "${name}" создан!`);
            ServerManager.renderServers(client);
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
            ServerManager.renderServers(client);
            if (client.currentServerId === serverId) {
                client.currentServerId = null;
                client.currentServer = null;
                UIManager.closePanel(client, client.roomSelectorPanel);
                UIManager.updateStatus(client, 'Сервер удален', 'normal');
            }
            UIManager.addMessage(client, 'System', `Сервер "${serverName}" удален!`);
        }
    }

    static renderServers(client) {
        const list = document.querySelector('.server-list');
        if (!list) return;
        list.innerHTML = '';

        const addBtn = document.createElement('button');
        addBtn.className = 'server-item add-server-btn';
        addBtn.innerHTML = '<span>+</span> Создать сервер';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ServerManager.createServer(client);
        });
        list.appendChild(addBtn);

        client.servers.forEach(server => {
            const el = document.createElement('div');
            el.className = 'server-item';
            el.dataset.server = server.id;
            const isOwner = server.ownerId === client.userId;
            el.innerHTML = `🏠 ${server.name} ${isOwner ? '<span class="server-owner">(Вы)</span>' : ''}`;

            el.addEventListener('click', () => {
                client.currentServerId = server.id;
                client.currentServer = server;
                UIManager.closePanel(client, client.serverSelectorPanel);
                RoomManager.loadRoomsForServer(client, server.id);
            });

            // Кнопка "Поделиться"
            if (isOwner) {
                const shareBtn = document.createElement('span');
                shareBtn.className = 'server-action-btn';
                shareBtn.innerHTML = '🔗';
                shareBtn.style.marginLeft = '5px';
                shareBtn.style.cursor = 'pointer';
                shareBtn.title = 'Скопировать ссылку-приглашение';
                shareBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${server.id}`;
                    navigator.clipboard.writeText(inviteLink)
                        .then(() => alert(`Ссылка скопирована:\n${inviteLink}`))
                        .catch(err => console.error('Не удалось скопировать:', err));
                });
                el.appendChild(shareBtn);
            }

            // Удаление
            if (isOwner) {
                const deleteBtn = document.createElement('span');
                deleteBtn.className = 'remove-server-btn';
                deleteBtn.innerHTML = '✕';
                deleteBtn.style.marginLeft = '5px';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.title = 'Удалить сервер';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ServerManager.deleteServer(client, server.id);
                });
                el.appendChild(deleteBtn);
            }

            list.insertBefore(el, addBtn);
        });
    }
}
