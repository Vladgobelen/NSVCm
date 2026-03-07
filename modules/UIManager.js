// modules/UIManager.js
import MembersManager from './MembersManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';

class UIManager {
    static client = null;
    static unreadCounts = {};

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

    static addMessage(user, text, timestamp = null, type = 'text', imageUrl = null, messageId = null, readBy = [], userId = null) {
        const messagesContainer = document.querySelector('.messages-container');
        if (!messagesContainer) return;

        const safeUser = user || 'Unknown';
        const safeText = text || '';
        const client = this.client || window.voiceClient;
        const isOwn = client && client.username && safeUser === client.username;

        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        if (messageId) messageElement.dataset.messageId = messageId;
        if (readBy?.length) messageElement.dataset.readBy = JSON.stringify(readBy);

        const time = timestamp
            ? new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        let finalImageUrl = imageUrl;
        if (type === 'image' && imageUrl?.startsWith('/')) {
            if (client?.API_SERVER_URL) {
                finalImageUrl = client.API_SERVER_URL + imageUrl;
            }
        }

        const avatarHtml = isOwn ? '' : `<div class="message-avatar">${safeUser.charAt(0).toUpperCase()}</div>`;

        if (type === 'image') {
            messageElement.innerHTML = `
                ${avatarHtml}
                <div class="message-content${isOwn ? ' own' : ''}">
                    <div class="message-header">
                        <span class="message-username">${this.escapeHtml(safeUser)}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-text">
                        <div class="image-placeholder" data-src="${this.escapeHtml(finalImageUrl)}" style="cursor: pointer;">
                            📷 Изображение
                        </div>
                    </div>
                </div>
            `;
            const imagePlaceholder = messageElement.querySelector('.image-placeholder');
            if (imagePlaceholder && finalImageUrl) {
                imagePlaceholder.addEventListener('click', () => {
                    this.openImageModal(finalImageUrl);
                });
            }
        } else {
            const formattedText = this.escapeHtmlAndFormat(safeText);
            messageElement.innerHTML = `
                ${avatarHtml}
                <div class="message-content${isOwn ? ' own' : ''}">
                    <div class="message-header">
                        <span class="message-username">${this.escapeHtml(safeUser)}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-text">${formattedText}</div>
                </div>
            `;
        }

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        setTimeout(() => messageElement.classList.add('appeared'), 10);
    }

    static openImageModal(imageUrl) {
        const existingModal = document.querySelector('.image-modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'image-modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            cursor: zoom-out;
        `;

        const imageElement = document.createElement('img');
        imageElement.src = imageUrl;
        imageElement.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 24px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        closeBtn.addEventListener('click', () => {
            modalOverlay.remove();
        });

        modalOverlay.appendChild(imageElement);
        modalOverlay.appendChild(closeBtn);

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });

        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                modalOverlay.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };

        document.addEventListener('keydown', escapeHandler);
        document.body.appendChild(modalOverlay);
    }

    static updateMessageReadStatus(messageId, readerId, readerName) {
        const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
        if (!msgEl) return;

        const readBy = JSON.parse(msgEl.dataset.readBy || '[]');
        if (!readBy.includes(readerId)) {
            readBy.push(readerId);
            msgEl.dataset.readBy = JSON.stringify(readBy);
        }

        const timeEl = msgEl.querySelector('.message-time');
        if (timeEl) {
            const ownMsg = msgEl.querySelector('.message-content.own');
            if (ownMsg) {
                const readers = readBy.length;
                if (readers === 0) {
                    timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓';
                } else if (readers === 1) {
                    timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓✓';
                } else {
                    timeEl.textContent = timeEl.textContent.replace(/✓✓?$/, '') + ' ✓✓✓';
                }
            }
        }
    }

    static updateMicButton(status) {
        const states = {
            'disconnected': { class: 'disconnected', text: '🎤', title: 'Не подключен к голосовому каналу' },
            'connecting': { class: 'connecting', text: '🎤', title: 'Подключение...' },
            'connected': { class: 'connected', text: '🎤', title: 'Микрофон выключен (нажмите чтобы включить)' },
            'active': { class: 'active', text: '🔴', title: 'Микрофон включен (нажмите чтобы выключить)' },
            'error': { class: 'error', text: '🎤', title: 'Ошибка доступа к микрофону' }
        };

        const state = states[status] || states.disconnected;
        const selectors = ['.mic-button', '.mic-toggle-btn'];

        selectors.forEach(sel => {
            const element = document.querySelector(sel);
            if (element) {
                element.className = sel.replace('.', '') + ' ' + state.class;
                element.textContent = state.text;
                element.title = state.title;
            }
        });
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

    static escapeHtmlAndFormat(text) {
        if (!text) return '';
        let processed = text.replace(/\n/g, '\n');
        processed = processed
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        processed = processed.replace(/{#([0-9A-Fa-f]{6})}([^{}]*){}/g, (match, color, content) => {
            if (!/^#[0-9A-Fa-f]{6}$/.test('#' + color)) return match;
            return `<span style="color:#${color}">${content}</span>`;
        });

        processed = processed.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>');
        processed = processed.replace(/__([^_]+?)__/g, '<u>$1</u>');
        processed = processed.replace(/~~([^~]+?)~~/g, '<s>$1</s>');
        processed = processed.replace(/\*([^*]+?)\*/g, '<i>$1</i>');
        processed = processed.replace(/\n/g, '<br>');

        return processed;
    }

    static escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static updateMembersListWithStatus(onlineMembers, offlineMembers) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) {
            console.error('❌ Members list element not found');
            return;
        }

        const savedSliderValues = new Map();
        membersList.querySelectorAll('.member-item').forEach(item => {
            const userId = item.dataset.userId;
            const slider = item.querySelector('.member-volume-slider');
            if (userId && slider) {
                let value = VolumeBoostManager.getGain(userId);
                if (value !== null) {
                    savedSliderValues.set(userId, Math.round(value * 100));
                } else {
                    savedSliderValues.set(userId, slider.value);
                }
            }
        });

        membersList.innerHTML = '';

        // Онлайн секция
        const onlineHeader = document.createElement('div');
        onlineHeader.className = 'members-section-header online-header';
        onlineHeader.innerHTML = `
            <span class="section-toggle-icon">${MembersManager.isSectionCollapsed('online') ? '▶' : '▼'}</span>
            <span class="section-title">Онлайн (${onlineMembers?.length || 0})</span>
        `;
        onlineHeader.addEventListener('click', () => {
            MembersManager.toggleSection('online');
        });
        membersList.appendChild(onlineHeader);

        const onlineContainer = document.createElement('div');
        onlineContainer.className = 'members-section-content';
        onlineContainer.style.display = MembersManager.isSectionCollapsed('online') ? 'none' : 'block';

        if (onlineMembers && onlineMembers.length > 0) {
            onlineMembers.forEach(user => {
                const memberElement = this._createMemberElement(user, savedSliderValues, true);
                if (memberElement) {
                    onlineContainer.appendChild(memberElement);
                }
            });
        }
        membersList.appendChild(onlineContainer);

        // Офлайн секция
        const offlineHeader = document.createElement('div');
        offlineHeader.className = 'members-section-header offline-header';
        offlineHeader.innerHTML = `
            <span class="section-toggle-icon">${MembersManager.isSectionCollapsed('offline') ? '▶' : '▼'}</span>
            <span class="section-title">Офлайн (${offlineMembers?.length || 0})</span>
        `;
        offlineHeader.addEventListener('click', () => {
            MembersManager.toggleSection('offline');
        });
        membersList.appendChild(offlineHeader);

        const offlineContainer = document.createElement('div');
        offlineContainer.className = 'members-section-content';
        offlineContainer.style.display = MembersManager.isSectionCollapsed('offline') ? 'none' : 'block';

        if (offlineMembers && offlineMembers.length > 0) {
            offlineMembers.forEach(user => {
                const memberElement = this._createMemberElement(user, savedSliderValues, false);
                if (memberElement) {
                    offlineContainer.appendChild(memberElement);
                }
            });
        }
        membersList.appendChild(offlineContainer);

        if ((!onlineMembers || onlineMembers.length === 0) && (!offlineMembers || offlineMembers.length === 0)) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'members-empty';
            emptyMessage.textContent = 'В комнате нет участников';
            membersList.appendChild(emptyMessage);
        }

        this.syncVolumeSliders();
    }

    static _createMemberElement(user, savedSliderValues, isOnline) {
        if (!user || !user.userId) {
            return null;
        }

        const memberElement = document.createElement('div');
        memberElement.className = 'member-item' + (isOnline ? '' : ' offline');
        memberElement.dataset.userId = user.userId;
        memberElement.dataset.clientId = user.clientId || '';

        const savedValue = savedSliderValues.get(user.userId) || 100;

        memberElement.innerHTML = `
            <div class="member-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="member-info">
                <div class="member-name ${isOnline ? '' : 'offline-text'}">${this.escapeHtml(user.username)}</div>
                <div class="member-controls">
                    <div class="member-status">
                        <div class="mic-indicator ${isOnline && user.isMicActive ? 'active' : ''}"
                            title="${user.isMicActive ? 'Микрофон включен' : 'Микрофон выключен'}"></div>
                    </div>
                    <input type="range" class="member-volume-slider" min="0" max="200" value="${savedValue}"
                        title="Громкость: ${savedValue}%" data-producer-id="" style="display: none;">
                </div>
            </div>
        `;

        const slider = memberElement.querySelector('.member-volume-slider');
        if (slider && !slider._hasVolumeHandler) {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                const producerId = e.target.dataset.producerId;
                e.target.title = `Громкость: ${value}%`;
                const userId = window.producerUserMap?.get(producerId) || window.producerClientMap?.get(producerId);
                if (userId) {
                    VolumeBoostManager.setGain(userId, value / 100);
                }
            });
            slider._hasVolumeHandler = true;
        }

        if (isOnline) {
            memberElement.addEventListener('mouseenter', () => {
                if (slider.dataset.producerId) {
                    slider.style.display = 'block';
                }
            });

            memberElement.addEventListener('mouseleave', () => {
                setTimeout(() => {
                    if (!slider.matches(':hover')) {
                        slider.style.display = 'none';
                    }
                }, 100);
            });

            slider.addEventListener('mouseleave', () => {
                slider.style.display = 'none';
            });
        }

        return memberElement;
    }

    static updateMembersList(members) {
        const onlineMembers = members.filter(m => m.isOnline === true);
        const offlineMembers = members.filter(m => m.isOnline !== true);
        this.updateMembersListWithStatus(onlineMembers, offlineMembers);
    }

    static syncVolumeSliders() {
        const membersList = document.querySelector('.members-list');
        if (!membersList) {
            console.error('❌ Members list not found');
            return;
        }

        const memberItems = membersList.querySelectorAll('.member-item:not(.offline)');
        const producerUserMap = window.producerUserMap || new Map();
        const producerClientMap = window.producerClientMap || new Map();

        memberItems.forEach(item => {
            const slider = item.querySelector('.member-volume-slider');
            if (slider) {
                slider.style.display = 'none';
                slider.dataset.producerId = '';
            }
        });

        for (const [producerId, userId] of producerUserMap.entries()) {
            const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
            if (memberItem) {
                const slider = memberItem.querySelector('.member-volume-slider');
                if (slider) {
                    slider.dataset.producerId = producerId;
                    slider.style.display = 'block';
                }
            }
        }

        for (const [producerId, clientId] of producerClientMap.entries()) {
            if (producerUserMap.has(producerId)) continue;
            const memberItem = membersList.querySelector(`.member-item[data-client-id="${clientId}"]:not(.offline)`);
            if (memberItem) {
                const slider = memberItem.querySelector('.member-volume-slider');
                if (slider) {
                    slider.dataset.producerId = producerId;
                    slider.style.display = 'block';
                    const userId = memberItem.dataset.userId;
                    if (userId && !producerUserMap.has(producerId)) {
                        if (!window.producerUserMap) window.producerUserMap = new Map();
                        window.producerUserMap.set(producerId, userId);
                    }
                }
            }
        }
    }

    static showVolumeSliderByUserId(producerId, userId) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) {
            console.error('❌ Members list element not found');
            return;
        }

        const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
        if (memberItem) {
            const slider = memberItem.querySelector('.member-volume-slider');
            if (slider) {
                slider.dataset.producerId = producerId;
                slider.style.display = 'block';
                if (!slider._hasVolumeHandler) {
                    slider.addEventListener('input', (e) => {
                        const value = e.target.value;
                        const pid = e.target.dataset.producerId;
                        e.target.title = `Громкость: ${value}%`;
                        const userId = window.producerUserMap?.get(pid) || window.producerClientMap?.get(pid);
                        if (userId) {
                            VolumeBoostManager.setGain(userId, value / 100);
                        }
                    });
                    slider._hasVolumeHandler = true;
                }
            }
        }
    }

    static updateMemberMicState(userId, isActive) {
        const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
        if (memberElement) {
            const micIndicator = memberElement.querySelector('.mic-indicator');
            if (micIndicator) {
                const isOnline = !memberElement.classList.contains('offline');
                if (isOnline) {
                    micIndicator.className = isActive ? 'mic-indicator active' : 'mic-indicator';
                    micIndicator.title = isActive ? 'Микрофон включен' : 'Микрофон выключен';
                } else {
                    micIndicator.className = 'mic-indicator';
                    micIndicator.title = 'Микрофон выключен';
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

    static updateRoomUI(client) {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        let roomTitle = 'Выберите комнату';
        if (client.currentRoom) {
            const currentRoomData = client.rooms.find(room => room.id === client.currentRoom);
            if (currentRoomData) {
                roomTitle = `Комната: ${currentRoomData.name}`;
            } else {
                roomTitle = `Комната: ${client.currentRoom}`;
            }
        }

        this.updateRoomTitle(roomTitle);
        this.updateMicButton(client.isConnected ? (client.isMicActive ? 'active' : 'connected') : 'disconnected');
    }

    static updateRoomTitle(title) {
        const titleElement = document.querySelector('.current-room-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }

    static clearMessages() {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
    }

    static setUnreadCount(serverId, count, hasMention, personalCount = 0) {
        this.unreadCounts[serverId] = { count, hasMention, personalCount };
        this.updateServerBadges();
    }

    static updateServerBadges() {
        const serversList = document.querySelector('.servers-list');
        if (!serversList) return;

        const serverItems = serversList.querySelectorAll('.server-item');
        serverItems.forEach(item => {
            const serverId = item.dataset.server;
            const existingBadge = item.querySelector('.unread-badge');
            if (existingBadge) {
                existingBadge.remove();
            }

            const unreadData = this.unreadCounts[serverId];
            if (unreadData && unreadData.count > 0) {
                const badge = document.createElement('span');
                badge.className = 'unread-badge' + (unreadData.hasMention ? ' has-mention' : '');
                if (unreadData.personalCount > 0) {
                    badge.textContent = `${unreadData.count}@${unreadData.personalCount}`;
                } else {
                    badge.textContent = unreadData.count;
                }
                item.appendChild(badge);
            }
        });

        const serversToggleBtn = document.querySelector('#serversToggle');
        if (serversToggleBtn) {
            const existingBtnBadge = serversToggleBtn.querySelector('.unread-badge');
            if (existingBtnBadge) {
                existingBtnBadge.remove();
            }

            let totalCount = 0;
            let totalPersonalCount = 0;
            let totalHasMention = false;

            for (const serverId in this.unreadCounts) {
                totalCount += this.unreadCounts[serverId].count || 0;
                totalPersonalCount += this.unreadCounts[serverId].personalCount || 0;
                if (this.unreadCounts[serverId].hasMention) {
                    totalHasMention = true;
                }
            }

            if (totalCount > 0) {
                const btnBadge = document.createElement('span');
                btnBadge.className = 'unread-badge' + (totalHasMention ? ' has-mention' : '');
                if (totalPersonalCount > 0) {
                    btnBadge.textContent = `${totalCount}@${totalPersonalCount}`;
                } else {
                    btnBadge.textContent = totalCount;
                }
                serversToggleBtn.appendChild(btnBadge);
            }
        }
    }

    static clearUnreadForServer(serverId) {
        if (this.unreadCounts[serverId]) {
            delete this.unreadCounts[serverId];
            this.updateServerBadges();
        }
    }

    static clearAllUnread() {
        this.unreadCounts = {};
        this.updateServerBadges();
    }
}

export default UIManager;
