// modules/ForwardModal.js
import UIManager from './UIManager.js';

class ForwardModal {
    static modal = null;
    static onSelectCallback = null;
    static searchTerm = '';
    static expandedServers = new Set();

    static open(client, messageId, sourceRoomId, messageObj = null) {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }

        this.onSelectCallback = async (targetRoomId) => {
            if (client && typeof client.forwardMessage === 'function') {
                client.forwardMessage(messageId, targetRoomId);
            }
            this.close();
        };

        this.render(client, sourceRoomId, messageObj);
    }

    static async render(client, sourceRoomId, messageObj = null) {
        const modal = document.createElement('div');
        modal.className = 'forward-modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';

        const content = document.createElement('div');
        content.className = 'forward-modal-content';
        content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 0; max-width: 500px; width: 90%; max-height: 70vh; border: 1px solid #404060; display: flex; flex-direction: column; overflow: hidden;';

        content.innerHTML = `
            <div class="forward-modal-header" style="padding: 16px 20px; border-bottom: 1px solid #404060; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #e0e0e0; font-size: 16px;">📤 Переслать сообщение</h3>
                <button class="forward-modal-close" style="background: none; border: none; color: #888; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px;">✕</button>
            </div>
            <div class="forward-modal-search" style="padding: 12px 16px; border-bottom: 1px solid #404060;">
                <input type="text" id="forward-search-input" placeholder="Поиск деревьев и гнёзд..." style="width: 100%; padding: 10px 12px; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px; font-size: 14px; outline: none;">
            </div>
            <div class="forward-modal-body" style="padding: 16px 20px; overflow-y: auto; flex: 1; min-height: 200px;">
                <div class="forward-tree-container">
                    <div class="loading-state" style="text-align: center; padding: 20px; color: #888;">Загрузка...</div>
                </div>
            </div>
            <div class="forward-modal-footer" style="padding: 12px 16px; border-top: 1px solid #404060; display: flex; justify-content: flex-end;">
                <button class="forward-modal-cancel" style="padding: 8px 16px; background: #404060; color: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Отмена</button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);
        this.modal = modal;

        // Закрытие по клику на оверлей
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });

        // Кнопка закрытия
        const closeBtn = content.querySelector('.forward-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Кнопка отмены
        const cancelBtn = content.querySelector('.forward-modal-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.close());
        }

        // Поиск
        const searchInput = content.querySelector('#forward-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderTree(client, content, sourceRoomId);
            });
        }

        // Загружаем данные и рендерим дерево
        await this.loadServersAndRooms(client);
        this.renderTree(client, content, sourceRoomId);
    }

    static async loadServersAndRooms(client) {
        if (!client) return;

        // Сохраняем уже загруженные комнаты для каждого сервера
        if (!this.serversData) {
            this.serversData = new Map();
        }

        for (const server of client.servers) {
            if (!server || !server.id) continue;

            // Проверяем, нужно ли загружать комнаты
            const isPrivate = this.isPrivateServer(server);
            const needRooms = !this.serversData.has(server.id) || 
                              (isPrivate && this.serversData.get(server.id)?.rooms === undefined);

            if (needRooms) {
                try {
                    let rooms = [];
                    if (isPrivate) {
                        // Для приватных серверов комната = сам сервер
                        const displayName = this.getPrivateServerDisplayName(server, client.userId);
                        rooms = [{
                            id: server.id,
                            name: displayName,
                            serverId: server.id,
                            type: 'private'
                        }];
                    } else {
                        // Обычные серверы - запрашиваем комнаты
                        const response = await fetch(`${client.API_SERVER_URL}/api/servers/${server.id}/rooms`, {
                            headers: {
                                'Authorization': `Bearer ${client.token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        if (response.ok) {
                            const data = await response.json();
                            rooms = data.rooms || [];
                        }
                    }
                    
                    this.serversData.set(server.id, {
                        server: server,
                        rooms: rooms,
                        isPrivate: isPrivate
                    });
                } catch (error) {
                    console.error(`❌ [FORWARD] Ошибка загрузки комнат для сервера ${server.id}:`, error);
                    this.serversData.set(server.id, {
                        server: server,
                        rooms: [],
                        isPrivate: isPrivate,
                        error: true
                    });
                }
            }
        }
    }

    static isPrivateServer(server) {
        return server?.type === 'private' ||
               server?.isPrivate === true ||
               (server?.id && server.id.startsWith('user_') && server.id.includes('_user_'));
    }

    static getPrivateServerDisplayName(server, currentUserId) {
        if (!server || !server.id) return server?.name || 'Приватный чат';
        
        if (server.displayName) return server.displayName;
        
        let otherUserId = null;
        if (server.participantIds && Array.isArray(server.participantIds)) {
            otherUserId = server.participantIds.find(id => id !== currentUserId);
        }
        if (!otherUserId && server.members && Array.isArray(server.members)) {
            otherUserId = server.members.find(id => id !== currentUserId);
        }
        if (!otherUserId) {
            const parts = server.id.split('_user_');
            if (parts.length === 2) {
                otherUserId = currentUserId === parts[0] ? parts[1] : parts[0];
                if (!otherUserId.startsWith('user_')) {
                    otherUserId = 'user_' + otherUserId;
                }
            }
        }
        
        if (otherUserId) {
            const cachedName = UIManager.usernameCache?.get(otherUserId);
            if (cachedName) return cachedName;
            return otherUserId.replace('user_', '').substring(0, 8);
        }
        return server.name || 'Приватный чат';
    }

    static renderTree(client, content, sourceRoomId) {
        const container = content.querySelector('.forward-tree-container');
        if (!container) return;

        if (!this.serversData || this.serversData.size === 0) {
            container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px; color: #888;">Нет доступных деревьев</div>';
            return;
        }

        let hasResults = false;
        let html = '<div class="forward-tree">';

        // Сортируем серверы: сначала не приватные, потом приватные
        const serversList = Array.from(this.serversData.values());
        const publicServers = serversList.filter(s => !s.isPrivate);
        const privateServers = serversList.filter(s => s.isPrivate);
        const allServers = [...publicServers, ...privateServers];

        for (const { server, rooms, isPrivate, error } of allServers) {
            if (!server || !server.id) continue;
            
            const serverName = isPrivate 
                ? `👤 ${this.getPrivateServerDisplayName(server, client.userId)}`
                : `🌳 ${server.name}`;
            
            // Фильтр по поиску
            const searchMatch = this.searchTerm === '' || 
                                serverName.toLowerCase().includes(this.searchTerm) ||
                                rooms.some(r => r.name && r.name.toLowerCase().includes(this.searchTerm));
            
            if (!searchMatch) continue;
            
            hasResults = true;
            
            // 🔥 ИСПРАВЛЕНИЕ: Приватные сервера всегда развернуты по умолчанию
            const isExpanded = isPrivate ? true : this.expandedServers.has(server.id);
            const expandIcon = isExpanded ? '▼' : '▶';
            
            html += `
                <div class="forward-tree-server" data-server-id="${server.id}">
                    <div class="forward-tree-server-header" style="padding: 8px 0; font-weight: 600; color: #e0e0e0; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; border-radius: 4px;">
                        <span class="forward-tree-expand" style="font-size: 12px; width: 16px; text-align: center;">${expandIcon}</span>
                        <span>${this.escapeHtml(serverName)}</span>
                    </div>
                    <div class="forward-tree-rooms" style="margin-left: 22px; ${isExpanded ? '' : 'display: none;'}">
            `;
            
            if (rooms && rooms.length > 0) {
                for (const room of rooms) {
                    if (!room || !room.id) continue;
                    
                    // Пропускаем текущую комнату
                    if (room.id === sourceRoomId) continue;
                    
                    // Фильтр по поиску
                    if (this.searchTerm !== '' && 
                        !room.name?.toLowerCase().includes(this.searchTerm) &&
                        !serverName.toLowerCase().includes(this.searchTerm)) {
                        continue;
                    }
                    
                    const roomName = isPrivate ? serverName : `🔊 ${room.name}`;
                    
                    html += `
                        <div class="forward-tree-room" data-room-id="${room.id}" style="padding: 8px 0; cursor: pointer; color: #b0b0c0; display: flex; align-items: center; gap: 6px; transition: background 0.2s ease; border-radius: 4px; padding-left: 8px;">
                            <span>📋</span>
                            <span>${this.escapeHtml(roomName)}</span>
                        </div>
                    `;
                }
            } else if (!error) {
                html += '<div class="empty-state" style="padding: 8px 0; color: #666; font-size: 12px;">Нет доступных гнёзд</div>';
            } else {
                html += '<div class="error-state" style="padding: 8px 0; color: #e74c3c; font-size: 12px;">Ошибка загрузки</div>';
            }
            
            html += `
                    </div>
                </div>
            `;
        }

        html += '</div>';

        if (!hasResults) {
            html = '<div class="empty-state" style="text-align: center; padding: 20px; color: #888;">Ничего не найдено</div>';
        }

        container.innerHTML = html;

        // Добавляем обработчики
        container.querySelectorAll('.forward-tree-server-header').forEach(header => {
            const serverDiv = header.closest('.forward-tree-server');
            const serverId = serverDiv?.dataset.serverId;
            const roomsDiv = serverDiv?.querySelector('.forward-tree-rooms');
            const expandSpan = header.querySelector('.forward-tree-expand');
            
            if (serverId && roomsDiv) {
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isCurrentlyExpanded = roomsDiv.style.display !== 'none';
                    if (isCurrentlyExpanded) {
                        roomsDiv.style.display = 'none';
                        if (expandSpan) expandSpan.textContent = '▶';
                        this.expandedServers.delete(serverId);
                    } else {
                        roomsDiv.style.display = '';
                        if (expandSpan) expandSpan.textContent = '▼';
                        this.expandedServers.add(serverId);
                    }
                });
            }
        });

        container.querySelectorAll('.forward-tree-room').forEach(roomEl => {
            const roomId = roomEl.dataset.roomId;
            roomEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onSelectCallback) {
                    this.onSelectCallback(roomId);
                }
                this.close();
            });
            
            // Hover эффекты
            roomEl.addEventListener('mouseenter', () => {
                roomEl.style.background = '#3d3d5c';
                roomEl.style.color = '#e0e0e0';
            });
            roomEl.addEventListener('mouseleave', () => {
                roomEl.style.background = '';
                roomEl.style.color = '#b0b0c0';
            });
        });
    }

    static escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static close() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        this.onSelectCallback = null;
        this.searchTerm = '';
        // Не очищаем expandedServers при закрытии, чтобы сохранить состояние
    }
}

export default ForwardModal;
