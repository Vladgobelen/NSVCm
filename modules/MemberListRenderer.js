import MembersManager from './MembersManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';
import ContextMenuManager from './ContextMenuManager.js';
import AvatarManager from './AvatarManager.js';
import AvatarUploadModal from './AvatarUploadModal.js';

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

    const savedSliderValues = new Map();
    membersList.querySelectorAll('.member-item').forEach((item) => {
      const userId = item.dataset.userId;
      const slider = item.querySelector('.member-volume-slider');
      if (userId && slider) {
        const value = VolumeBoostManager.getGain(userId);
        savedSliderValues.set(userId, value !== null ? Math.round(value * 100) : parseInt(slider.value, 10) || 100);
      }
    });

    const needFullRebuild = !membersList.querySelector('.members-section-header');

    if (needFullRebuild) {
      membersList.innerHTML = '';
      this._renderFullList(membersList, onlineMembers, offlineMembers, savedSliderValues);
    } else {
      this._incrementalUpdate(membersList, onlineMembers, offlineMembers, savedSliderValues);
    }

    this.syncVolumeSliders();
  }

  static _renderFullList(membersList, onlineMembers, offlineMembers, savedSliderValues) {
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
    onlineContainer.dataset.section = 'online';
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
    offlineContainer.dataset.section = 'offline';
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
  }

  static _incrementalUpdate(membersList, onlineMembers, offlineMembers, savedSliderValues) {
    const onlineContainer = membersList.querySelector('.members-section-content[data-section="online"]');
    const offlineContainer = membersList.querySelector('.members-section-content[data-section="offline"]');
    const onlineHeader = membersList.querySelector('.online-header');
    const offlineHeader = membersList.querySelector('.offline-header');

    if (onlineHeader) {
      const countSpan = onlineHeader.querySelector('.section-title');
      if (countSpan) {
        countSpan.textContent = `Онлайн (${onlineMembers?.length || 0})`;
      }
    }
    if (offlineHeader) {
      const countSpan = offlineHeader.querySelector('.section-title');
      if (countSpan) {
        countSpan.textContent = `Офлайн (${offlineMembers?.length || 0})`;
      }
    }

    if (onlineContainer) {
      this._updateSectionMembers(onlineContainer, onlineMembers || [], savedSliderValues, true);
    }

    if (offlineContainer) {
      this._updateSectionMembers(offlineContainer, offlineMembers || [], savedSliderValues, false);
    }

    const emptyMessage = membersList.querySelector('.members-empty');
    if (emptyMessage && (onlineMembers?.length > 0 || offlineMembers?.length > 0)) {
      emptyMessage.remove();
    }
  }

  static _updateSectionMembers(container, members, savedSliderValues, isOnline) {
    const existingElements = new Map();
    container.querySelectorAll('.member-item').forEach((el) => {
      if (el.dataset.userId) {
        existingElements.set(el.dataset.userId, el);
      }
    });

    const newMemberIds = new Set(members.map((m) => m.userId).filter((id) => id));

    for (const [userId, el] of existingElements) {
      if (!newMemberIds.has(userId)) {
        el.remove();
      }
    }

    const fragment = document.createDocumentFragment();

    for (const member of members) {
      const userId = member.userId;
      if (!userId) continue;

      let element = container.querySelector(`.member-item[data-user-id="${userId}"]`);

      if (element) {
        this._updateMemberElement(element, member, savedSliderValues, isOnline);
        container.appendChild(element);
      } else {
        const newElement = this._createMemberElement(member, savedSliderValues, isOnline);
        if (newElement) {
          fragment.appendChild(newElement);
        }
      }
    }

    if (fragment.children.length > 0) {
      container.appendChild(fragment);
    }
  }

  static _updateMemberElement(element, member, savedSliderValues, isOnline) {
    if (isOnline) {
      element.classList.remove('offline');
    } else {
      element.classList.add('offline');
    }

    if (element.dataset.clientId !== (member.clientId || '')) {
      element.dataset.clientId = member.clientId || '';
    }

    const nameEl = element.querySelector('.member-name');
    if (nameEl && nameEl.textContent !== member.username) {
      nameEl.textContent = member.username;
      if (!isOnline) {
        nameEl.classList.add('offline-text');
      } else {
        nameEl.classList.remove('offline-text');
      }
    }

    const avatarContainer = element.querySelector('.member-avatar');
    if (avatarContainer) {
      const avatarUrl = AvatarManager?.getUrl(member.userId);
      if (avatarUrl) {
        element.dataset.avatarUrl = avatarUrl;
      }

      const currentImg = avatarContainer.querySelector('img');

      if (avatarUrl) {
        if (!currentImg || currentImg.src !== avatarUrl) {
          avatarContainer.innerHTML = '';
          const img = document.createElement('img');
          img.src = avatarUrl;
          img.alt = member.username;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
          img.onerror = () => {
            img.remove();
            avatarContainer.textContent = member.username.charAt(0).toUpperCase();
            delete element.dataset.avatarUrl;
          };
          avatarContainer.appendChild(img);
        }
      } else if (currentImg) {
        avatarContainer.innerHTML = '';
        avatarContainer.textContent = member.username.charAt(0).toUpperCase();
        delete element.dataset.avatarUrl;
      }
    }

    const slider = element.querySelector('.member-volume-slider');
    if (slider) {
      const savedValue = savedSliderValues.get(member.userId) || 100;
      if (slider.value !== String(savedValue)) {
        slider.value = savedValue;
        slider.title = `Громкость: ${savedValue}%`;
      }
    }
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

    const avatarUrl = AvatarManager ? AvatarManager.getUrl(user.userId) : null;
    if (avatarUrl) {
      memberElement.dataset.avatarUrl = avatarUrl;
    }

    const initial = user.username.charAt(0).toUpperCase();
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${this._escapeHtml(user.username)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : this._escapeHtml(initial);

    memberElement.innerHTML = `
      <div class="member-avatar">${avatarHtml}</div>
      <div class="member-info">
        <div class="member-name ${isOnline ? '' : 'offline-text'}">${this._escapeHtml(user.username)}</div>
        <div class="member-controls">
          <div class="member-status">
            <div class="mic-indicator ${isOnline && user.isMicActive ? 'active' : ''}" title="${user.isMicActive ? 'Микрофон включен' : 'Микрофон выключен'}" style="background-color: ${isOnline && user.isMicActive ? '#2ecc71' : isOnline ? '#e74c3c' : '#606070'}; box-shadow: ${isOnline && user.isMicActive ? '0 0 8px #2ecc71' : 'none'};"></div>
          </div>
          <input type="range" class="member-volume-slider" min="0" max="400" value="${savedValue}" title="Громкость: ${savedValue}%" data-producer-id="">
        </div>
      </div>
    `;

    const avatarContainer = memberElement.querySelector('.member-avatar');
    if (avatarContainer) {
      const client = window.voiceClient;
      if (client && user.userId === client.userId) {
        avatarContainer.style.cursor = 'pointer';
        avatarContainer.title = 'Нажмите, чтобы изменить аватар';
        avatarContainer.addEventListener('click', (e) => {
          e.stopPropagation();
          AvatarUploadModal.open();
        });
      } else {
        avatarContainer.style.cursor = 'default';
      }
    }

    const slider = memberElement.querySelector('.member-volume-slider');
    if (slider && !slider._hasVolumeHandler) {

slider.addEventListener('input', (e) => {
  const value = e.target.value;
  const gain = value / 100;
  e.target.title = `Громкость: ${value}%`;
  const memberItem = e.target.closest('.member-item');
  const uid = memberItem?.dataset.userId;
  if (uid) {
    VolumeBoostManager.setGain(uid, gain);
  }
});

      slider._hasVolumeHandler = true;
    }

    return memberElement;
  }

  static updateAllAvatars() {
    const membersList = document.querySelector('.members-list');
    if (!membersList) return;

    const memberItems = membersList.querySelectorAll('.member-item');

    memberItems.forEach((item) => {
      const userId = item.dataset.userId;
      if (!userId) return;

      const avatarUrl = AvatarManager?.getUrl(userId);
      if (!avatarUrl) return;

      item.dataset.avatarUrl = avatarUrl;

      const avatarContainer = item.querySelector('.member-avatar');
      if (avatarContainer && !avatarContainer.querySelector('img')) {
        const username = item.querySelector('.member-name')?.textContent || '?';
        avatarContainer.innerHTML = `<img src="${avatarUrl}" alt="${this._escapeHtml(username)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.onerror=null; this.parentElement.innerHTML='${username.charAt(0).toUpperCase()}'; delete this.parentElement.parentElement.dataset.avatarUrl;">`;
      }
    });
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
        slider.dataset.producerId = '';
      }
    });

    for (const [producerId, userId] of producerUserMap.entries()) {
      const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
      if (memberItem) {
        const slider = memberItem.querySelector('.member-volume-slider');
        if (slider) {
          slider.dataset.producerId = producerId;
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
    if (!userId) return;

    const membersList = document.querySelector('.members-list');
    if (!membersList) return;

    const memberElement = membersList.querySelector(`.member-item[data-user-id="${userId}"]`);
    if (!memberElement) return;

    const micIndicator = memberElement.querySelector('.mic-indicator');
    if (!micIndicator) return;

    const isOnline = !memberElement.classList.contains('offline');
    const shouldBeActive = isOnline && isActive;

    const hasActiveClass = micIndicator.classList.contains('active');
    if (hasActiveClass === shouldBeActive) {
      return;
    }

    if (shouldBeActive) {
      micIndicator.classList.add('active');
    } else {
      micIndicator.classList.remove('active');
    }

    micIndicator.title = shouldBeActive ? 'Микрофон включен' : 'Микрофон выключен';
    micIndicator.style.backgroundColor = shouldBeActive ? '#2ecc71' : isOnline ? '#e74c3c' : '#606070';
    micIndicator.style.boxShadow = shouldBeActive ? '0 0 8px #2ecc71' : isOnline ? '0 0 8px #e74c3c' : 'none';
  }

  static showVolumeSliderByUserId(producerId, userId) {
    const membersList = document.querySelector('.members-list');
    if (!membersList) return;

    const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]:not(.offline)`);
    if (!memberItem) return;

    const slider = memberItem.querySelector('.member-volume-slider');
    if (!slider) return;

    slider.dataset.producerId = producerId;

    if (!slider._hasVolumeHandler) {
      slider.addEventListener('input', (e) => {
        const value = e.target.value;
        const gain = value / 100;
        e.target.title = `Громкость: ${value}%`;
        VolumeBoostManager.setGain(userId, gain);
      });
      slider._hasVolumeHandler = true;
    }
  }
}

export default MemberListRenderer;
