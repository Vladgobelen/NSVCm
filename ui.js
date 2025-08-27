// ui.js (исправленный)
class UIManager {
    static updateStatus(client, message, type = 'normal') {
        if (client.statusText) {
            client.statusText.textContent = message;
        }
        if (client.statusIndicator) {
            client.statusIndicator.className = 'status-indicator';
            if (type === 'connecting') {
                client.statusIndicator.classList.add('connecting');
            } else if (type === 'disconnected') {
                client.statusIndicator.classList.add('disconnected');
            } else if (type === 'connected') {
                client.statusIndicator.classList.add('connected');
            }
        }
    }

    static addMessage(client, user, text, time = new Date().toISOString()) {
        if (!client.messagesContainer) return;

        const el = document.createElement('div');
        el.className = 'message';

        const date = new Date(time);
        const formattedTime = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const safeText = Utils.escapeHtml(text);
        const safeUser = Utils.escapeHtml(user);

        el.innerHTML = `
            <div class="message-avatar">${safeUser.charAt(0).toUpperCase()}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${safeUser}</span>
                    <span class="message-time">${formattedTime}</span>
                </div>
                <div class="message-text">${safeText}</div>
            </div>
        `;

        client.messagesContainer.appendChild(el);
        client.messagesContainer.scrollTop = client.messagesContainer.scrollHeight;
        
        // Анимация появления
        setTimeout(() => {
            el.classList.add('appeared');
        }, 10);
    }

    static openPanel(client, panel) {
        if (!panel) return;
        panel.style.display = 'flex';
        setTimeout(() => {
            panel.style.opacity = '1';
            panel.style.transform = 'translateX(0)';
        }, 10);
    }

    static closePanel(client, panel) {
        if (!panel) return;
        panel.style.opacity = '0';
        panel.style.transform = 'translateX(-100%)';
        setTimeout(() => {
            panel.style.display = 'none';
        }, 300);
    }

    static updateMembersList(client, clients) {
        if (!client.membersList) return;

        client.membersList.innerHTML = '';

        // Текущий пользователь
        const selfEl = document.createElement('div');
        selfEl.className = 'member-item';
        selfEl.innerHTML = `
            <div class="member-avatar">${(client.username || 'Вы').charAt(0).toUpperCase()}</div>
            <div class="member-name">${client.username || 'Вы'}</div>
            <div class="member-status ${client.isMicActive ? 'active' : 'muted'}" id="selfStatus"></div>
        `;
        client.membersList.appendChild(selfEl);

        // Другие пользователи
        clients
            .filter(c => c.clientId !== client.clientID)
            .forEach(user => {
                const el = document.createElement('div');
                el.className = 'member-item';
                const displayName = user.username || 'Пользователь';
                el.innerHTML = `
                    <div class="member-avatar">${displayName.charAt(0).toUpperCase()}</div>
                    <div class="member-name">${Utils.escapeHtml(displayName)}</div>
                    <div class="member-status ${user.isMicActive ? 'active' : 'muted'}"></div>
                `;
                client.membersList.appendChild(el);
            });

        // Обновляем счётчик
        if (client.membersCount) {
            const total = clients.length + 1;
            client.membersCount.textContent = `${total} ${UIManager.pluralize(total, 'участник', 'участника', 'участников')}`;
        }
    }

    static pluralize(n, one, two, many) {
        if (n % 10 === 1 && n % 100 !== 11) return one;
        if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return two;
        return many;
    }

    static renderDesktopRooms(client, rooms) {
        const list = document.querySelector('.sidebar .rooms-list');
        if (!list) return;

        list.innerHTML = '';

        rooms.forEach(room => {
            const el = document.createElement('div');
            el.className = 'room-item';
            el.dataset.room = room.id;
            el.dataset.type = room.type;
            const isOwner = room.ownerId === client.userId;
            el.innerHTML = `
                ${room.type === 'voice' ? '🔊' : '💬'} 
                ${Utils.escapeHtml(room.name)} 
                ${isOwner ? '<span class="room-owner">(Вы)</span>' : ''}
            `;
            el.addEventListener('click', () => {
                list.querySelectorAll('.room-item').forEach(i => i.classList.remove('active'));
                el.classList.add('active');
                client.joinRoom(room.id);
            });
            list.appendChild(el);
        });

        // Кнопка создания комнаты
        const btn = document.createElement('div');
        btn.className = 'room-item create-room-btn';
        btn.innerHTML = '<span>+</span> Создать комнату';
        btn.addEventListener('click', () => {
            RoomManager.createRoom(client);
        });
        list.appendChild(btn);
    }

    static renderMobileRooms(client, rooms) {
        const list = document.querySelector('.room-selector-panel .rooms-list');
        if (!list) return;

        list.innerHTML = '';

        rooms.forEach(room => {
            const el = document.createElement('div');
            el.className = 'room-item';
            el.dataset.room = room.id;
            el.dataset.type = room.type;
            const isOwner = room.ownerId === client.userId;
            el.innerHTML = `
                ${room.type === 'voice' ? '🔊' : '💬'} 
                ${Utils.escapeHtml(room.name)} 
                ${isOwner ? '<span class="room-owner">(Вы)</span>' : ''}
            `;
            el.addEventListener('click', () => {
                UIManager.closePanel(client, client.roomSelectorPanel);
                client.joinRoom(room.id);
            });
            list.appendChild(el);
        });

        // Кнопка создания комнаты
        const btn = document.createElement('div');
        btn.className = 'room-item create-room-btn';
        btn.innerHTML = '<span>+</span> Создать комнату';
        btn.addEventListener('click', () => {
            RoomManager.createRoom(client);
        });
        list.appendChild(btn);
    }

    static onRoomJoined(client, roomName) {
        if (client.currentRoomTitle) {
            client.currentRoomTitle.textContent = Utils.escapeHtml(roomName);
        }
        UIManager.updateStatus(client, 'Подключено', 'connected');
    }

    static onRoomLeft(client) {
        if (client.currentRoomTitle) {
            client.currentRoomTitle.textContent = 'Не в комнате';
        }
        UIManager.updateStatus(client, 'Отключено', 'disconnected');
    }
}

console.log('[UI] UIManager загружен и готов к работе');
