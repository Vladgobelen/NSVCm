import AvatarManager from '../dist/shared/AvatarManager.js';
import VolumeBoostManager from '../dist/shared/VolumeBoostManager.js';

class MobileOnlineBar {
    static _container = null;
    static _isVisible = false;
    static _isSidebarCollapsed = false;
    static _isMembersPanelOpen = false;
    static _resizeHandler = null;
    static _mutationObserver = null;
    static _observers = null;
    static _currentMemberIds = new Set();
    static _updatePending = false;
    static _lastMembers = null;

    static init() {
        this._createContainer();
        this._bindSidebarObserver();
        this._bindMembersPanelObserver();
        this._bindResize();
        this._syncWithDOM();
    }

    static _createContainer() {
        if (this._container) return;
        this._container = document.createElement('div');
        this._container.id = 'mobile-online-bar';
        this._container.className = 'mobile-online-bar';
        this._container.style.display = 'none';
        this._container.style.top = '140px';
        
        this._container.addEventListener('wheel', (e) => {
            const icon = e.target.closest('.mobile-online-icon');
            if (icon) {
                e.preventDefault();
                const userId = icon.dataset.userId;
                if (userId) {
                    const delta = e.deltaY > 0 ? -0.05 : 0.05;
                    let currentGain = VolumeBoostManager.getGain(userId);
                    if (currentGain === null) currentGain = 1.0;
                    const newGain = Math.max(0, Math.min(4.0, currentGain + delta));
                    VolumeBoostManager.setGain(userId, newGain);
                    this._updateVolumeFill(icon, newGain);
                    this._syncMemberVolumeSlider(userId, newGain);
                }
            }
        }, { passive: false });
        
        document.body.appendChild(this._container);
    }

static _updateVolumeFill(icon, gain) {
    const percentage = Math.round(gain * 100);
    const fillPercent = Math.min(100, (gain / 4.0) * 100);
    
    let fillBar = icon.querySelector('.volume-fill-bar');
    if (!fillBar) {
        fillBar = document.createElement('div');
        fillBar.className = 'volume-fill-bar';
        fillBar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);pointer-events:none;transition:height 0.15s ease;border-radius:0 0 50% 50%;';
        icon.appendChild(fillBar);
    }
    fillBar.style.height = `${fillPercent}%`;
    
    if (!icon.dataset.originalTitle) {
        icon.dataset.originalTitle = icon.title || '';
    }
    icon.title = `${icon.dataset.originalTitle} — 🔊 ${percentage}%`;
}

    static _bindSidebarObserver() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        
        this._mutationObserver = new MutationObserver(() => this._syncWithDOM());
        this._mutationObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    static _bindMembersPanelObserver() {
        const membersPanel = document.querySelector('.members-panel');
        if (!membersPanel) return;
        
        const observer = new MutationObserver(() => this._syncWithDOM());
        observer.observe(membersPanel, { attributes: true, attributeFilter: ['class'] });
        
        if (!this._observers) this._observers = [];
        this._observers.push(observer);
    }

    static _bindResize() {
        this._resizeHandler = () => this._evaluateVisibility();
        window.addEventListener('resize', this._resizeHandler);
    }

    static _syncWithDOM() {
        const sidebar = document.querySelector('.sidebar');
        const membersPanel = document.querySelector('.members-panel');
        
        if (!sidebar) return;
        
        this._isSidebarCollapsed = !sidebar.classList.contains('open');
        
        if (membersPanel) {
            this._isMembersPanelOpen = membersPanel.classList.contains('open');
        }
        
        this._evaluateVisibility();
    }

    static _evaluateVisibility() {
        if (!this._container) return;
        
        const isMobile = window.innerWidth <= 768;
        const shouldShow = isMobile && this._isSidebarCollapsed && !this._isMembersPanelOpen;
        
        if (shouldShow !== this._isVisible) {
            this._isVisible = shouldShow;
            this._container.style.display = shouldShow ? 'flex' : 'none';
            if (shouldShow) {
                requestAnimationFrame(() => {
                    this._container.style.opacity = '1';
                    this._container.style.transform = 'translateY(0)';
                    if (this._lastMembers) {
                        this._renderMembers(this._lastMembers);
                    }
                });
            } else {
                this._container.style.opacity = '0';
                this._container.style.transform = 'translateY(-10px)';
            }
        }
    }

    static async update(members) {
        this._lastMembers = members;
        
        if (!this._container || !this._isVisible) return;
        
        if (this._updatePending) return;
        this._updatePending = true;
        
        requestAnimationFrame(async () => {
            await this._renderMembers(members);
            this._updatePending = false;
        });
    }

    static async _renderMembers(members) {
        if (!this._container) return;
        
        try {
            const onlineMembers = Array.isArray(members) ? members.filter(m => m.isOnline) : [];
            const limitedMembers = onlineMembers.slice(0, 10);
            
            const newMemberIds = new Set(limitedMembers.map(m => m.userId).filter(id => id));
            const hasChanged = this._hasMembersChanged(newMemberIds);
            
            if (!hasChanged) return;
            
            const existingIcons = Array.from(this._container.children);
            for (const icon of existingIcons) {
                const userId = icon.dataset.userId;
                if (userId && !newMemberIds.has(userId)) {
                    icon.remove();
                }
            }
            
            const userIds = limitedMembers.map(m => m.userId).filter(id => id);
            const needFetch = userIds.some(id => !AvatarManager.getUrl(id));
            if (needFetch) {
                await AvatarManager.fetchUsers(userIds);
            }
            
            for (const member of limitedMembers) {
                const userId = member.userId;
                if (!userId) continue;
                
                let icon = this._container.querySelector(`.mobile-online-icon[data-user-id="${userId}"]`);
                
                if (!icon) {
                    icon = document.createElement('div');
                    icon.className = 'mobile-online-icon';
                    icon.dataset.userId = userId;
                    icon.title = member.username;
                    this._container.appendChild(icon);
                    this._fillIconContent(icon, member);
                    
                    const savedGain = VolumeBoostManager.getGain(userId);
                    if (savedGain !== null && savedGain !== 1.0) {
                        this._updateVolumeFill(icon, savedGain);
                    }
                } else {
                    if (icon.title !== member.username && !icon.dataset.originalTitle) {
                        icon.title = member.username;
                    }
                    
                    const avatarUrl = AvatarManager.getUrl(userId);
                    const currentImg = icon.querySelector('img');
                    
                    if (avatarUrl && (!currentImg || currentImg.src !== avatarUrl)) {
                        this._fillIconContent(icon, member);
                    } else if (!avatarUrl && currentImg) {
                        this._fillIconContent(icon, member);
                    } else if (!avatarUrl && !currentImg) {
                        const expectedText = member.username.charAt(0).toUpperCase();
                        if (icon.textContent !== expectedText) {
                            icon.textContent = expectedText;
                        }
                    }
                }
            }
            
            this._currentMemberIds = newMemberIds;
            
        } catch (error) {
            console.error('MobileOnlineBar render error:', error.message);
        }
    }

    static _syncMemberVolumeSlider(userId, gain) {
        const membersList = document.querySelector('.members-list');
        if (!membersList) return;
        
        const memberItem = membersList.querySelector(`.member-item[data-user-id="${userId}"]`);
        if (!memberItem) return;
        
        const slider = memberItem.querySelector('.member-volume-slider');
        if (slider) {
            const percentage = Math.round(gain * 100);
            slider.value = percentage;
            slider.title = `Громкость: ${percentage}%`;
        }
    }

    static _fillIconContent(icon, member) {
        const userId = member.userId;
        const avatarUrl = AvatarManager.getUrl(userId);
        
        if (avatarUrl) {
            icon.dataset.avatarUrl = avatarUrl;
        } else {
            delete icon.dataset.avatarUrl;
        }
        
        icon.innerHTML = '';
        
        if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = member.username;
            img.className = 'mobile-online-avatar-img';
            img.onerror = () => {
                img.remove();
                icon.textContent = member.username.charAt(0).toUpperCase();
                delete icon.dataset.avatarUrl;
            };
            icon.appendChild(img);
        } else {
            icon.textContent = member.username.charAt(0).toUpperCase();
        }
    }

    static updateAllAvatars() {
        if (!this._container) return;
        
        const icons = this._container.querySelectorAll('.mobile-online-icon');
        
        icons.forEach(icon => {
            const userId = icon.dataset.userId;
            if (!userId) return;
            
            const avatarUrl = AvatarManager.getUrl(userId);
            if (!avatarUrl || icon.dataset.avatarUrl === avatarUrl) return;
            
            icon.dataset.avatarUrl = avatarUrl;
            
            const existingImg = icon.querySelector('img');
            if (existingImg) {
                existingImg.src = avatarUrl;
            } else {
                const member = this._lastMembers?.find(m => m.userId === userId);
                if (member) {
                    this._fillIconContent(icon, member);
                }
            }
        });
    }

    static _hasMembersChanged(newMemberIds) {
        if (newMemberIds.size !== this._currentMemberIds.size) return true;
        
        for (const id of newMemberIds) {
            if (!this._currentMemberIds.has(id)) return true;
        }
        
        return false;
    }

    static destroy() {
        if (this._container) {
            this._container.remove();
            this._container = null;
            this._isVisible = false;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._mutationObserver) {
            this._mutationObserver.disconnect();
            this._mutationObserver = null;
        }
        if (this._observers) {
            this._observers.forEach(obs => obs.disconnect());
            this._observers = null;
        }
        this._currentMemberIds.clear();
        this._lastMembers = null;
        this._updatePending = false;
        this._isMembersPanelOpen = false;
    }
}

export default MobileOnlineBar;
