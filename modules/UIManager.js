import MembersManager from './MembersManager.js';

class UIManager {
    static client = null;

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
            roomElement.innerHTML = `🔊 ${room.name} ${isOwner ? '<span class="owner-badge">(Вы)</span>' : ''}`;
            
            roomElement.addEventListener('click', () => {
                client.currentRoom = room.id;
                client.joinRoom(room.id);
            });
            
            roomsList.appendChild(roomElement);
        });
    }



static syncVolumeSliders() {
    console.group('🎚️ UIManager.syncVolumeSliders - START');
    const membersList = document.querySelector('.members-list');
    if (!membersList) {
        console.error('❌ Members list not found');
        console.groupEnd();
        return;
    }
    const memberItems = membersList.querySelectorAll('.member-item');
    const producerUserMap = window.producerUserMap || new Map();
    const producerClientMap = window.producerClientMap || new Map();

    // Скрываем все слайдеры
    memberItems.forEach(item => {
        const slider = item.querySelector('.member-volume-slider');
        if (slider) {
            slider.style.display = 'none';
            slider.dataset.producerId = '';
        }
    });

    // 1. Сначала обрабатываем привязку по userId (приоритет)
    for (const [producerId, userId] of producerUserMap.entries()) {
        const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]`);
        if (memberItem) {
            const slider = memberItem.querySelector('.member-volume-slider');
            if (slider) {
                slider.dataset.producerId = producerId;
                slider.style.display = 'block';
                console.log('✅ Slider shown by userId:', userId, 'producer:', producerId);
            }
        }
    }

    // 2. Затем — fallback по clientId (для продюсеров без userId, например из /producers)
    for (const [producerId, clientId] of producerClientMap.entries()) {
        // Пропускаем, если уже обработан через userId
        if (producerUserMap.has(producerId)) continue;

        const memberItem = membersList.querySelector(`.member-item[data-client-id="${clientId}"]`);
        if (memberItem) {
            const slider = memberItem.querySelector('.member-volume-slider');
            if (slider) {
                slider.dataset.producerId = producerId;
                slider.style.display = 'block';
                console.log('✅ Slider shown by clientId:', clientId, 'producer:', producerId);

                // 🔥 Дополнительно: если у участника есть userId — сохраняем в producerUserMap
                const userId = memberItem.dataset.userId;
                if (userId && !producerUserMap.has(producerId)) {
                    if (!window.producerUserMap) window.producerUserMap = new Map();
                    window.producerUserMap.set(producerId, userId);
                    console.log('🔁 Mapped producer', producerId, 'to userId', userId, 'via clientId', clientId);
                }
            }
        }
    }

    console.groupEnd();
}




static updateMembersList(members) {
    console.group('👥 UIManager.updateMembersList - START');
    console.log('🔹 Members received:', members.length);
    console.log('🔹 Members data:', members.map(m => ({ username: m.username, clientId: m.clientId, isOnline: m.isOnline })));
    const membersList = document.querySelector('.members-list');
    if (!membersList) {
        console.error('❌ Members list element not found');
        console.groupEnd();
        return;
    }
    // Полная очистка контейнера
    membersList.innerHTML = '';
    // Добавляем чекбокс общего мута
    const globalMuteHeader = document.createElement('div');
    globalMuteHeader.className = 'global-mute-header';
    globalMuteHeader.innerHTML = `
        <label class="global-mute-label">
            <input type="checkbox" id="globalMuteCheckbox">
            <span>Общий мут</span>
        </label>
    `;
    membersList.appendChild(globalMuteHeader);
    // Обработчик общего мута
    const globalMuteCheckbox = globalMuteHeader.querySelector('#globalMuteCheckbox');
    globalMuteCheckbox.addEventListener('change', (e) => {
        const isMuted = e.target.checked;
        const sliders = membersList.querySelectorAll('.member-volume-slider');
        console.log('🔹 Global mute changed:', isMuted);
        sliders.forEach(slider => {
            slider.value = isMuted ? 0 : 100;
            const producerId = slider.dataset.producerId;
            const audioElement = window.audioElements?.get(producerId);
            if (audioElement) {
                audioElement.volume = isMuted ? 0 : slider.value / 100;
                console.log('🔹 Volume set for producer:', producerId, 'volume:', audioElement.volume);
            }
            slider.title = `Громкость: ${slider.value}%`;
        });
    });
    // Создаем элементы участников
    members.forEach(user => {
        if (!user || !user.userId) {
            console.warn('⚠️ Skipping invalid member:', user);
            return;
        }
        const memberElement = document.createElement('div');
        memberElement.className = 'member-item';
        memberElement.dataset.userId = user.userId;
        memberElement.dataset.clientId = user.clientId || '';
        const isOnline = user.isOnline === true;
        const statusClass = isOnline ? 'online' : 'offline';
        const statusTitle = isOnline ? 'Online' : 'Offline';
        memberElement.innerHTML = `
            <div class="member-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="member-info">
                <div class="member-name">${user.username}</div>
                <div class="member-controls">
                    <div class="member-status">
                        <div class="status-indicator ${statusClass}" title="${statusTitle}"></div>
                        <div class="mic-indicator ${isOnline && user.isMicActive ? 'active' : ''}" 
                             title="${user.isMicActive ? 'Microphone active' : 'Microphone muted'}"></div>
                    </div>
                    <input type="range" class="member-volume-slider" min="0" max="100" value="100" 
                           title="Громкость: 100%" data-producer-id="" style="display: none;">
                </div>
            </div>
        `;
        membersList.appendChild(memberElement);
        // Настраиваем обработчик слайдера (делаем это один раз)
        const slider = memberElement.querySelector('.member-volume-slider');
        if (slider && !slider._hasVolumeHandler) {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                const producerId = e.target.dataset.producerId;
                e.target.title = `Громкость: ${value}%`;
                const audioElement = window.audioElements?.get(producerId);
                if (audioElement) {
                    audioElement.volume = value / 100;
                    console.log('🔊 Volume changed for producer:', producerId, 'volume:', audioElement.volume);
                }
            });
            slider._hasVolumeHandler = true;
        }
    });
    console.log('✅ Members list updated. Now syncing sliders...');
    // 🔥 КЛЮЧЕВОЙ ВЫЗОВ: Синхронизируем слайдеры с актуальной картой
    this.syncVolumeSliders();
    console.groupEnd();
}


static showVolumeSlider(producerId, clientId) {
    console.group('🎚️ UIManager.showVolumeSlider - START');
    console.log('🔹 producerId:', producerId);
    console.log('🔹 clientId:', clientId);
    
    const membersList = document.querySelector('.members-list');
    if (!membersList) {
        console.error('❌ Members list element not found');
        console.groupEnd();
        return;
    }

    // Ищем участника по clientId
    const memberItems = membersList.querySelectorAll('.member-item');
    let found = false;
    
    for (const memberItem of memberItems) {
        const memberClientId = memberItem.dataset.clientId;
        console.log('🔹 Checking member item with clientId:', memberClientId);
        
        if (memberClientId === clientId) {
            const slider = memberItem.querySelector('.member-volume-slider');
            if (slider) {
                slider.dataset.producerId = producerId;
                slider.style.display = 'block';
                console.log('✅ Volume slider shown for client:', clientId, 'producer:', producerId);
                found = true;
                
                // Добавляем обработчик если его нет
                if (!slider._hasVolumeHandler) {
                    slider.addEventListener('input', (e) => {
                        const value = e.target.value;
                        const producerId = e.target.dataset.producerId;
                        e.target.title = `Громкость: ${value}%`;
                        
                        const audioElement = window.audioElements?.get(producerId);
                        if (audioElement) {
                            audioElement.volume = value / 100;
                            console.log('🔊 Volume changed:', producerId, 'volume:', audioElement.volume);
                        }
                    });
                    slider._hasVolumeHandler = true;
                }
                break;
            }
        }
    }
    
    if (!found) {
        console.warn('❌ Member item not found for clientId:', clientId);
        console.log('🔹 Available member items:', Array.from(memberItems).map(item => ({
            clientId: item.dataset.clientId,
            userId: item.dataset.userId
        })));
    }
    
    console.groupEnd();
}

static showVolumeSliderByUserId(producerId, userId) {
    console.group('🎚️ UIManager.showVolumeSliderByUserId - START');
    console.log('🔹 producerId:', producerId);
    console.log('🔹 userId:', userId);
    const membersList = document.querySelector('.members-list');
    if (!membersList) {
        console.error('❌ Members list element not found');
        console.groupEnd();
        return;
    }
    const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]`);
    if (memberItem) {
        const slider = memberItem.querySelector('.member-volume-slider');
        if (slider) {
            slider.dataset.producerId = producerId;
            slider.style.display = 'block';
            console.log('✅ Volume slider shown for user:', userId, 'producer:', producerId);
            if (!slider._hasVolumeHandler) {
                slider.addEventListener('input', (e) => {
                    const value = e.target.value;
                    const pid = e.target.dataset.producerId;
                    e.target.title = `Громкость: ${value}%`;
                    const audioEl = window.audioElements?.get(pid);
                    if (audioEl) {
                        audioEl.volume = value / 100;
                    }
                });
                slider._hasVolumeHandler = true;
            }
        } else {
            console.warn('⚠️ Slider element not found for user:', userId);
        }
    } else {
        console.warn('❌ Member item not found for userId:', userId);
        const allItems = Array.from(membersList.querySelectorAll('.member-item')).map(el => ({
            userId: el.dataset.userId,
            clientId: el.dataset.clientId
        }));
        console.log('🔹 Available members:', allItems);
    }
    console.groupEnd();
}


static updateMemberMicState(userId, isActive) {
    const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
    if (memberElement) {
        const micIndicator = memberElement.querySelector('.mic-indicator');
        if (micIndicator) {
            // Получаем объект пользователя, чтобы проверить, онлайн ли он.
            const member = MembersManager.getMember(userId);
            if (member) {
                // Обновляем индикатор микрофона ТОЛЬКО если пользователь онлайн.
                if (member.isOnline) {
                    micIndicator.className = isActive ? 'mic-indicator active' : 'mic-indicator';
                    micIndicator.title = isActive ? 'Microphone active' : 'Microphone muted';
                } else {
                    // 🔴🔴🔴 КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Если пользователь оффлайн, ВСЕГДА сбрасываем индикатор микрофона.
                    micIndicator.className = 'mic-indicator';
                    micIndicator.title = 'Microphone muted';
                }
            }
        }
    }
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

    // ИСПРАВЛЕНО: Получаем название комнаты вместо ID
    let roomTitle = 'Выберите комнату';
    if (client.currentRoom) {
        // Ищем комнату по ID в списке загруженных комнат
        const currentRoomData = client.rooms.find(room => room.id === client.currentRoom);
        if (currentRoomData) {
            roomTitle = `Комната: ${currentRoomData.name}`;
        } else {
            // На случай, если комната не найдена (например, при переподключении), используем ID как fallback
            roomTitle = `Комната: ${client.currentRoom}`;
        }
    }
    this.updateRoomTitle(roomTitle);

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
