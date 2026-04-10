import MembersManager from './MembersManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';
import ContextMenuManager from './ContextMenuManager.js';

class MemberListRenderer {
    static _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static updateMembersList(members) {
        const onlineMembers = members.filter((m) => m.isOnline === true);
        const offlineMembers = members.filter((m) => m.isOnline !== true);
        this.updateMembersListWithStatus(onlineMembers, offlineMembers);
    }

    static updateMembersListWithStatus(onlineMembers, offlineMembers) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) return;

        // Сохраняем текущие значения слайдеров
        const savedSliderValues = new Map();
        membersList.querySelectorAll('.member-item').forEach((item) => {
            const userId = item.dataset.userId;
            const slider = item.querySelector('.member-volume-slider');
            if (userId && slider) {
                const value = VolumeBoostManager.getGain(userId);
                savedSliderValues.set(userId, value !== null ? Math.round(value * 100) : parseInt(slider.value, 10) || 100);
            }
        });

        membersList.innerHTML = '';

        const createSectionHeader = (title, count, type) => {
            const header = document.createElement('div');
            header.className = `members-section-header ${type}-header`;
            header.innerHTML = `<span class="section-toggle-icon">${MembersManager.isSectionCollapsed(type) ? '▶' : '▼'}</span><span class="section-title">${title} (${count})</span>`;
            header.addEventListener('click', () => MembersManager.toggleSection(type));
            return header;
        };

        const onlineHeader = createSectionHeader('Онлайн', onlineMembers?.length || 0, 'online');
        membersList.appendChild(onlineHeader);

        const onlineContainer = document.createElement('div');
        onlineContainer.className = 'members-section-content';
        onlineContainer.style.display = MembersManager.isSectionCollapsed('online') ? 'none' : 'block';

        if (onlineMembers?.length > 0) {
            onlineMembers.forEach((user) => {
                const el = this._createMemberElement(user, savedSliderValues, true);
                if (el) onlineContainer.appendChild(el);
            });
        }
        membersList.appendChild(onlineContainer);

        const offlineHeader = createSectionHeader('Офлайн', offlineMembers?.length || 0, 'offline');
        membersList.appendChild(offlineHeader);

        const offlineContainer = document.createElement('div');
        offlineContainer.className = 'members-section-content';
        offlineContainer.style.display = MembersManager.isSectionCollapsed('offline') ? 'none' : 'block';

        if (offlineMembers?.length > 0) {
            offlineMembers.forEach((user) => {
                const el = this._createMemberElement(user, savedSliderValues, false);
                if (el) offlineContainer.appendChild(el);
            });
        }
        membersList.appendChild(offlineContainer);

        if ((!onlineMembers || onlineMembers.length === 0) && (!offlineMembers || offlineMembers.length === 0)) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'members-empty';
            emptyMessage.textContent = 'В гнезде нет участников';
            membersList.appendChild(emptyMessage);
        }

        this.syncVolumeSliders();
    }

    static _createMemberElement(user, savedSliderValues, isOnline) {
        if (!user || !user.userId) return null;

        const memberElement = document.createElement('div');
        memberElement.className = `member-item${isOnline ? '' : ' offline'}`;
        memberElement.dataset.userId = user.userId;
        memberElement.dataset.clientId = user.clientId || '';

        memberElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            ContextMenuManager.showMemberContextMenu(event, user.userId, user.username);
        });

        const savedValue = savedSliderValues.get(user.userId) || 100;
        memberElement.innerHTML = `
            <div class="member-avatar">${this._escapeHtml(user.username.charAt(0).toUpperCase())}</div>
            <div class="member-info">
                <div class="member-name ${isOnline ? '' : 'offline-text'}">${this._escapeHtml(user.username)}</div>
                <div class="member-controls">
                    <div class="member-status">
                        <div class="mic-indicator ${isOnline && user.isMicActive ? 'active' : ''}" title="${user.isMicActive ? 'Микрофон включен' : 'Микрофон выключен'}"></div>
                    </div>
                    <input type="range" class="member-volume-slider" min="0" max="200" value="${savedValue}" title="Громкость: ${savedValue}%" data-producer-id="" style="display: none;">
                </div>
            </div>
        `;

        const slider = memberElement.querySelector('.member-volume-slider');
        if (slider && !slider._hasVolumeHandler) {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                const producerId = e.target.dataset.producerId;
                e.target.title = `Громкость: ${value}%`;
                const uid = window.producerUserMap?.get(producerId) || window.producerClientMap?.get(producerId);
                if (uid) VolumeBoostManager.setGain(uid, value / 100);
            });
            slider._hasVolumeHandler = true;
        }

        if (isOnline) {
            memberElement.addEventListener('mouseenter', () => {
                if (slider.dataset.producerId) slider.style.display = 'block';
            });
            memberElement.addEventListener('mouseleave', () => {
                setTimeout(() => {
                    if (!slider.matches(':hover')) slider.style.display = 'none';
                }, 100);
            });
            slider.addEventListener('mouseleave', () => {
                slider.style.display = 'none';
            });
        }

        return memberElement;
    }

    static syncVolumeSliders() {
        const membersList = document.querySelector('.members-list');
        if (!membersList) return;

        const memberItems = membersList.querySelectorAll('.member-item:not(.offline)');
        const producerUserMap = window.producerUserMap || new Map();
        const producerClientMap = window.producerClientMap || new Map();

        memberItems.forEach((item) => {
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

    static updateMemberMicState(userId, isActive, source = 'client') {
        const memberElement = document.querySelector(`.member-item[data-user-id="${userId}"]`);
        if (!memberElement) return;

        const micIndicator = memberElement.querySelector('.mic-indicator');
        if (!micIndicator) return;

        const isOnline = !memberElement.classList.contains('offline');
        const member = MembersManager.getMember(userId);
        const isServerData = member?.micSource === 'server' && member?.lastServerUpdate > Date.now() - 5000;

        if (isServerData || source === 'server') {
            if (isOnline) {
                micIndicator.className = isActive ? 'mic-indicator active' : 'mic-indicator';
                micIndicator.title = isActive ? 'Микрофон включен (сервер)' : 'Микрофон выключен (сервер)';
                micIndicator.style.backgroundColor = isActive ? '#2ecc71' : '#e74c3c';
                micIndicator.style.boxShadow = isActive ? '0 0 8px #2ecc71' : '0 0 8px #e74c3c';
                micIndicator.dataset.serverSync = 'true';
            } else {
                micIndicator.className = 'mic-indicator';
                micIndicator.title = 'Микрофон выключен';
                micIndicator.style.backgroundColor = '#606070';
                micIndicator.style.boxShadow = 'none';
                delete micIndicator.dataset.serverSync;
            }
        } else {
            if (isOnline) {
                micIndicator.className = isActive ? 'mic-indicator active' : 'mic-indicator';
                micIndicator.title = isActive ? 'Микрофон включен' : 'Микрофон выключен';
                micIndicator.style.backgroundColor = isActive ? '#2ecc71' : '#e74c3c';
                micIndicator.style.boxShadow = isActive ? '0 0 8px #2ecc71' : '0 0 8px #e74c3c';
            } else {
                micIndicator.className = 'mic-indicator';
                micIndicator.title = 'Микрофон выключен';
                micIndicator.style.backgroundColor = '#606070';
                micIndicator.style.boxShadow = 'none';
            }
        }
    }

    static showVolumeSliderByUserId(producerId, userId) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) return;

        const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
        if (!memberItem) return;

        const slider = memberItem.querySelector('.member-volume-slider');
        if (!slider) return;

        slider.dataset.producerId = producerId;
        slider.style.display = 'block';

        if (!slider._hasVolumeHandler) {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                const pid = e.target.dataset.producerId;
                e.target.title = `Громкость: ${value}%`;
                const uid = window.producerUserMap?.get(pid) || window.producerClientMap?.get(pid);
                if (uid) VolumeBoostManager.setGain(uid, value / 100);
            });
            slider._hasVolumeHandler = true;
        }
    }
}

export default MemberListRenderer;
