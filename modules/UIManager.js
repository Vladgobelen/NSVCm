import MembersManager from './MembersManager.js';

class UIManager {
    static client = null;

    // Добавляем метод для установки клиента
    static setClient(client) {
        this.client = client;
    }

    static updateStatus(text, status) {
        const statusText = document.querySelector('.status-text');
        const statusIndicator = document.querySelector('.status-indicator');
        
        if (statusText) {
            statusText.textContent = text;
        }
        if (statusIndicator) {
            statusIndicator.className = 'status-indicator';
            if (status === 'connecting') {
                statusIndicator.classList.add('connecting');
            } else if (status === 'disconnected') {
                statusIndicator.classList.add('disconnected');
            } else if (status === 'connected') {
                statusIndicator.classList.add('connected');
            }
        }
    }

    static openCreateRoomModal(client, onSubmit) {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.display = 'flex';
        modalOverlay.innerHTML = `
            <div class="modal-content">
                <h2>Создание комнаты</h2>
                <input type="text" id="roomNameInput" placeholder="Название комнаты" required>
                <div class="modal-buttons">
                    <button id="confirmCreateRoom">Создать</button>
                    <button id="cancelCreateRoom">Отмена</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalOverlay);

        const handleConfirm = () => {
            const name = document.getElementById('roomNameInput').value.trim();
            
            if (name.length < 3) {
                alert('Название комнаты должно быть не менее 3 символов');
                return;
            }
            
            modalOverlay.remove();
            onSubmit(name);
        };

        const handleCancel = () => {
            modalOverlay.remove();
        };

        modalOverlay.querySelector('#confirmCreateRoom').addEventListener('click', handleConfirm);
        modalOverlay.querySelector('#cancelCreateRoom').addEventListener('click', handleCancel);
        
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                handleCancel();
            }
        });
    }
    
    static updateRoomTitle(title) {
        const titleElement = document.querySelector('.current-room-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }

    static addMessage(user, text, timestamp = null) {
        const messagesContainer = document.querySelector('.messages-container');
        if (!messagesContainer) return;

        const safeUser = user || 'Unknown';
        const safeText = text || '';

        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        
        const time = timestamp ? 
            new Date(timestamp).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            }) : 
            new Date().toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
        
        messageElement.innerHTML = `
            <div class="message-avatar">${safeUser.charAt(0).toUpperCase()}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${this.escapeHtml(safeUser)}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${this.escapeHtml(safeText)}</div>
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        setTimeout(() => {
            messageElement.classList.add('appeared');
        }, 10);
    }

    static updateMicButton(status) {
        const micButton = document.querySelector('.mic-button');
        const micToggleBtn = document.querySelector('.mic-toggle-btn');
        
        const states = {
            'disconnected': {class: 'disconnected', text: '🎤', title: 'Не подключен к голосовому каналу'},
            'connecting': {class: 'connecting', text: '🎤', title: 'Подключение...'},
            'connected': {class: 'connected', text: '🎤', title: 'Микрофон выключен (нажмите чтобы включить)'},
            'active': {class: 'active', text: '🔴', title: 'Микрофон включен (нажмите чтобы выключить)'},
            'error': {class: 'error', text: '🎤', title: 'Ошибка доступа к микрофону'}
        };
        
        const state = states[status] || states.disconnected;
        
        if (micButton) {
            micButton.className = 'mic-button ' + state.class;
            micButton.textContent = state.text;
            micButton.title = state.title;
        }
        
        if (micToggleBtn) {
            micToggleBtn.className = 'mic-toggle-btn ' + state.class;
            micToggleBtn.textContent = state.text;
            micToggleBtn.title = state.title;
        }
    }

    static updateAudioStatus(activeConsumers) {
        const statusElement = document.querySelector('.audio-status');
        if (!statusElement) return;
        
        if (activeConsumers > 0) {
            statusElement.textContent = `Активных аудиопотоков: ${activeConsumers}`;
            statusElement.style.color = 'var(--success)';
        } else {
            statusElement.textContent = 'Нет активных аудиопотоков';
            statusElement.style.color = 'var(--text-muted)';
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
                import('./RoomManager.js').then(module => {
                    module.default.loadRoomsForServer(client, server.id);
                });
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
                        .catch(() => {});
                });
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'server-action-btn';
                deleteBtn.innerHTML = '✕';
                deleteBtn.title = 'Удалить';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    import('./ServerManager.js').then(module => {
                        module.default.deleteServer(client, server.id);
                    });
                });
                
                serverElement.appendChild(shareBtn);
                serverElement.appendChild(deleteBtn);
            }
            
            serversList.appendChild(serverElement);
        });
    }

    static renderRooms(client, rooms) {
        const roomsList = document.querySelector('.rooms-list');
        if (!roomsList) return;

        roomsList.innerHTML = '';
        
        rooms.forEach(room => {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            roomElement.dataset.room = room.id;
            
            const isOwner = room.ownerId === client.userId;
            // Все комнаты теперь голосовые, всегда используем иконку голосовой комнаты
            roomElement.innerHTML = `🔊 ${room.name} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''}`;
            
            roomElement.addEventListener('click', () => {
                client.currentRoom = room.id;
                client.joinRoom(room.id);
            });
            
            roomsList.appendChild(roomElement);
        });
    }

static updateMembersList(members) {
    const membersList = document.querySelector('.members-list');
    if (!membersList) return;

    membersList.innerHTML = '';
    
    if (this.client && this.client.username) {
        const selfElement = document.createElement('div');
        selfElement.className = 'member-item';
        const selfUsername = this.client.username || 'Вы';
        selfElement.innerHTML = `
            <div class="member-avatar">${selfUsername.charAt(0).toUpperCase()}</div>
            <div class="member-name">${selfUsername}</div>
            <div class="member-status">
                <div class="status-indicator online" title="Online"></div>
                <div class="mic-indicator ${this.client.isMicActive ? 'active' : ''}" title="${this.client.isMicActive ? 'Microphone active' : 'Microphone muted'}"></div>
            </div>
        `;
        membersList.appendChild(selfElement);
    }
    
    members.forEach(user => {
        if (user.userId === this.client.userId) return;
        
        const memberElement = document.createElement('div');
        memberElement.className = 'member-item';
        memberElement.innerHTML = `
            <div class="member-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="member-name">${user.username}</div>
            <div class="member-status">
                <div class="status-indicator online" title="Online"></div>
                <div class="mic-indicator ${user.isMicActive ? 'active' : ''}" title="${user.isMicActive ? 'Microphone active' : 'Microphone muted'}"></div>
            </div>
        `;
        membersList.appendChild(memberElement);
    });
}
    static openModal(title, content, onSubmit) {
        const modalOverlay = document.querySelector('.modal-overlay');
        const modalContent = document.querySelector('.modal-content');
        
        if (!modalOverlay || !modalContent) return;
        
        modalContent.innerHTML = `
            <h2>${title}</h2>
            ${content}
            <button class="modal-submit">OK</button>
        `;
        
        modalOverlay.classList.remove('hidden');
        
        const submitButton = modalContent.querySelector('.modal-submit');
        if (submitButton && onSubmit) {
            submitButton.addEventListener('click', onSubmit);
        }
    }

    static closeModal() {
        const modalOverlay = document.querySelector('.modal-overlay');
        if (modalOverlay) modalOverlay.classList.add('hidden');
    }

    static showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        errorElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ed4245;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 1000;
            max-width: 300px;
        `;
        
        document.body.appendChild(errorElement);
        
        setTimeout(() => {
            if (document.body.contains(errorElement)) {
                document.body.removeChild(errorElement);
            }
        }, 5000);
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static openSettings(client) {
        const modalContent = `
            <h2>Настройки</h2>
            <div class="setting-item">
                <label>Битрейт: <span id="bitrateValue">${client.bitrate / 1000}</span> kbps</label>
                <input type="range" id="bitrateSlider" min="16" max="64" value="${client.bitrate / 1000}" step="1">
            </div>
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="dtxCheckbox" ${client.dtxEnabled ? 'checked' : ''}>
                    DTX (Discontinuous Transmission)
                </label>
            </div>
            <div class="setting-item">
                <label>
                    <input type="checkbox" id="fecCheckbox" ${client.fecEnabled ? 'checked' : ''}>
                    FEC (Forward Error Correction)
                </label>
            </div>
            <button class="apply-settings-btn">Применить</button>
        `;
        
        this.openModal('Настройки', modalContent, () => {
            client.bitrate = document.getElementById('bitrateSlider').value * 1000;
            client.dtxEnabled = document.getElementById('dtxCheckbox').checked;
            client.fecEnabled = document.getElementById('fecCheckbox').checked;
            this.closeModal();
        });
        
        const bitrateSlider = document.getElementById('bitrateSlider');
        const bitrateValue = document.getElementById('bitrateValue');
        
        if (bitrateSlider && bitrateValue) {
            bitrateSlider.addEventListener('input', () => {
                bitrateValue.textContent = bitrateSlider.value;
            });
        }
    }

    static onRoomJoined(client, roomName) {
        this.updateRoomTitle(roomName);
        this.updateStatus('Подключено', 'connected');
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

    static toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.toggle('open');
    }

    static toggleMembersPanel(client) {
        const membersPanel = document.querySelector('.members-panel');
        membersPanel.classList.toggle('open');
    }

    static applySettings(client) {
        client.bitrate = document.getElementById('bitrateSlider').value * 1000;
        client.dtxEnabled = document.getElementById('dtxCheckbox').checked;
        client.fecEnabled = document.getElementById('fecCheckbox').checked;
        this.closeModal();
    }

    static updateRoomUI(client) {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        this.updateRoomTitle(client.currentRoom ? `Комната: ${client.currentRoom}` : 'Выберите комнату');
        
        this.updateMicButton(client.isConnected ? (client.isMicActive ? 'active' : 'connected') : 'disconnected');
    }

    static clearMessages() {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
    }
}

export default UIManager;
