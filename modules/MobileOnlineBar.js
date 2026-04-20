// modules/MobileOnlineBar.js
import AvatarManager from './AvatarManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';

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
            e.stopPropagation();
            this._container.scrollTop += e.deltaY;
        }, { passive: false });
        
        document.body.appendChild(this._container);
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
                    this._setupVolumeWheel(icon, userId); // 🔥 НОВОЕ: добавляем обработчик колеса
                } else {
                    if (icon.title !== member.username) {
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
                    
                    // 🔥 НОВОЕ: убеждаемся что обработчик колеса установлен
                    if (!icon._hasVolumeWheel) {
                        this._setupVolumeWheel(icon, userId);
                    }
                }
            }
            
            this._currentMemberIds = newMemberIds;
            
        } catch (error) {
            console.error('MobileOnlineBar render error:', error.message);
        }
    }

    // 🔥 НОВЫЙ МЕТОД: обработка колеса мыши для регулировки громкости
    static _setupVolumeWheel(icon, userId) {
        if (icon._hasVolumeWheel) return;
        
        icon.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Определяем направление: вверх = увеличение, вниз = уменьшение
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            
            // Получаем текущую громкость или начинаем с 1.0 (100%)
            let currentGain = VolumeBoostManager.getGain(userId);
            if (currentGain === null) {
                currentGain = 1.0;
            }
            
            // Вычисляем новое значение в пределах от 0 до 4.0 (0-400%)
            let newGain = Math.max(0, Math.min(4.0, currentGain + delta));
            
            // Устанавливаем новую громкость
            VolumeBoostManager.setGain(userId, newGain);
            
            // Показываем всплывающую подсказку с текущим уровнем
            this._showVolumeTooltip(icon, newGain);
            
            // Синхронизируем с бегунком в панели участников
            this._syncMemberVolumeSlider(userId, newGain);
        }, { passive: false });
        
        icon._hasVolumeWheel = true;
    }

    // 🔥 НОВЫЙ МЕТОД: показ всплывающей подсказки с уровнем громкости
    static _showVolumeTooltip(icon, gain) {
        // Удаляем старую подсказку если есть
        const existingTooltip = icon.querySelector('.volume-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        const percentage = Math.round(gain * 100);
        
        const tooltip = document.createElement('div');
        tooltip.className = 'volume-tooltip';
        tooltip.textContent = `🔊 ${percentage}%`;
        tooltip.style.cssText = `
            position: absolute;
            left: 50%;
            top: -30px;
            transform: translateX(-50%);
            background: rgba(26, 26, 46, 0.95);
            color: #e0e0e0;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
            border: 1px solid #5865f2;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            z-index: 1002;
            pointer-events: none;
            animation: volumeTooltipFade 1.5s ease forwards;
        `;
        
        // Добавляем анимацию если её нет
        if (!document.getElementById('volume-tooltip-style')) {
            const style = document.createElement('style');
            style.id = 'volume-tooltip-style';
            style.textContent = `
                @keyframes volumeTooltipFade {
                    0% { opacity: 0; transform: translateX(-50%) translateY(5px); }
                    15% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-5px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        icon.style.position = 'relative';
        icon.appendChild(tooltip);
        
        // Автоматически удаляем через 1.5 секунды
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.remove();
            }
        }, 1500);
    }

    // 🔥 НОВЫЙ МЕТОД: синхронизация с бегунком в панели участников
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
