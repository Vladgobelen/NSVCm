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
        if (!serversList) {
            console.error('Элемент servers-list не найден');
            return;
        }

        serversList.innerHTML = '';
        
        if (client.servers.length === 0) {
            serversList.innerHTML = '<div class="no-results">Нет серверов</div>';
            return;
        }
        
        client.servers.forEach(server => {
            const serverElement = document.createElement('div');
            serverElement.className = 'server-item';
            serverElement.dataset.server = server.id;
            
            const isOwner = server.ownerId === client.userId;
            const isMember = server.members && server.members.includes(client.userId);
            
            serverElement.innerHTML = `🏠 ${server.name} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''}`;
            
            serverElement.addEventListener('click', () => {
                console.log('Клик по серверу:', server.name);
                client.currentServerId = server.id;
                client.currentServer = server;
                
                // Очищаем поиск при переходе к комнатам
                if (client.serverSearchInput) {
                    client.serverSearchInput.value = '';
                }
                
                setTimeout(() => {
                    RoomManager.loadRoomsForServer(client, server.id);
                    client.showPanel('rooms');
                }, 100);
            });
            
            // Кнопки действий
            const actionButtons = document.createElement('div');
            actionButtons.className = 'server-actions';
            
            if (isOwner) {
                // Кнопки для владельца
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
                
                actionButtons.appendChild(shareBtn);
                actionButtons.appendChild(deleteBtn);
            } else if (isMember) {
                // Кнопка покидания для участников
                const leaveBtn = document.createElement('button');
                leaveBtn.className = 'server-action-btn leave-btn';
                leaveBtn.innerHTML = '🚪';
                leaveBtn.title = 'Покинуть сервер';
                leaveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.leaveServer(client, server.id);
                });
                
                actionButtons.appendChild(leaveBtn);
            }
            
            serverElement.appendChild(actionButtons);
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
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const errorMessage = errorData.error || 'Не удалось создать сервер';
                
                if (errorMessage.includes('уже существует')) {
                    alert(`Ошибка: ${errorMessage}. Выберите другое название.`);
                } else if (errorMessage.includes('Превышен лимит')) {
                    alert(`Ошибка: ${errorMessage}`);
                } else {
                    throw new Error(errorMessage);
                }
                return;
            }
            
            const data = await res.json();
            const serverData = data.server;
            
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
            
            UIManager.addMessage('System', `✅ Сервер "${serverName}" удален`);
        }
    }

    static async searchServers(client, query) {
        try {
            if (!query || query.length < 2) {
                // Если запрос пустой или слишком короткий, показываем все серверы
                this.renderServers(client);
                return;
            }

            const res = await fetch(`${client.API_SERVER_URL}/api/servers/search?q=${encodeURIComponent(query)}`, {
                headers: { 
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ошибка поиска');
            }
            
            const data = await res.json();
            this.renderSearchResults(client, data.servers);
        } catch (error) {
            console.error('Ошибка поиска серверов:', error);
            UIManager.showError('Ошибка поиска: ' + error.message);
        }
    }

    static renderSearchResults(client, servers) {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) {
            console.error('Элемент servers-list не найден');
            return;
        }

        serversList.innerHTML = '';
        
        if (servers.length === 0) {
            serversList.innerHTML = '<div class="no-results">Серверы не найдены</div>';
            return;
        }
        
        servers.forEach(server => {
            const serverElement = document.createElement('div');
            serverElement.className = 'server-item';
            serverElement.dataset.server = server.id;
            
            const isOwner = server.ownerId === client.userId;
            const isMember = client.servers.some(s => s.id === server.id);
            
            serverElement.innerHTML = `🏠 ${server.name} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''} ${!isMember ? '<span class="not-member-badge">(Не участник)</span>' : ''}`;
            
            if (isMember) {
                // Если пользователь уже участник, то при клике переходим к комнатам
                serverElement.addEventListener('click', () => {
                    console.log('Клик по серверу из поиска (участник):', server.name);
                    client.currentServerId = server.id;
                    client.currentServer = server;
                    
                    // Очищаем поиск при переходе к комнатам
                    if (client.serverSearchInput) {
                        client.serverSearchInput.value = '';
                    }
                    
                    setTimeout(() => {
                        RoomManager.loadRoomsForServer(client, server.id);
                        client.showPanel('rooms');
                    }, 100);
                });
            } else {
                // Если не участник, то делаем элемент некликабельным и добавляем кнопку присоединения
                serverElement.style.opacity = '0.7';
                serverElement.style.cursor = 'default';
                
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
            
            // Кнопки действий для владельцев
            if (isOwner) {
                const actionButtons = document.createElement('div');
                actionButtons.className = 'server-actions';
                
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
                
                actionButtons.appendChild(shareBtn);
                actionButtons.appendChild(deleteBtn);
                serverElement.appendChild(actionButtons);
            }
            
            serversList.appendChild(serverElement);
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
                body: JSON.stringify({ userId: client.userId, token: client.token })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Не удалось присоединиться');
            }

            const data = await res.json();
            const server = data.server;

            // Обновляем список серверов клиента
            const exists = client.servers.some(s => s.id === server.id);
            if (!exists) {
                client.servers.push(server);
                this.saveServersToLocalStorage(client);
            }

            // Очищаем поле поиска
            if (client.serverSearchInput) {
                client.serverSearchInput.value = '';
            }

            // Перезагружаем список серверов (показываем все серверы пользователя)
            this.renderServers(client);
            
            // Переключаемся на панель серверов
            client.showPanel('servers');
            
            // Показываем сообщение
            UIManager.addMessage('System', `✅ Вы присоединились к "${server.name}"`);

        } catch (error) {
            console.error('Ошибка вступления в сервер:', error);
            UIManager.showError(`❌ Не удалось присоединиться: ${error.message}`);
        }
    }

    static async leaveServer(client, serverId) {
        if (!confirm('Вы уверены, что хотите покинуть этот сервер?')) return;
        
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
                throw new Error(errorData.error || 'Не удалось покинуть сервер');
            }
            
            // Удаляем сервер из списка серверов клиента
            client.servers = client.servers.filter(server => server.id !== serverId);
            this.saveServersToLocalStorage(client);
            
            // Очищаем текущий сервер, если он был активным
            if (client.currentServerId === serverId) {
                client.currentServerId = null;
                client.currentServer = null;
            }
            
            // Перерисовываем список серверов
            this.renderServers(client);
            
            UIManager.addMessage('System', `✅ Вы покинули сервер`);
            
        } catch (error) {
            console.error('Ошибка при покидании сервера:', error);
            UIManager.showError('Ошибка: ' + error.message);
        }
    }

    static clearSearchAndShowAllServers(client) {
        // Очищаем поле поиска
        if (client.serverSearchInput) {
            client.serverSearchInput.value = '';
        }
        
        // Показываем все серверы пользователя
        this.renderServers(client);
    }
}

export default ServerManager;
