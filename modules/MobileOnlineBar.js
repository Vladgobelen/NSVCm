// modules/MobileOnlineBar.js
import AvatarManager from './AvatarManager.js';

class MobileOnlineBar {
    static _container = null;
    static _isVisible = false;
    static _isSidebarCollapsed = false;
    static _resizeHandler = null;
    static _mutationObserver = null;
    static _currentMemberIds = new Set();
    static _updatePending = false;
    static _lastMembers = null;

    static init() {
        this._createContainer();
        this._bindSidebarObserver();
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

    static _bindResize() {
        this._resizeHandler = () => this._evaluateVisibility();
        window.addEventListener('resize', this._resizeHandler);
    }

    static _syncWithDOM() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        this._isSidebarCollapsed = !sidebar.classList.contains('open');
        this._evaluateVisibility();
    }

    static _evaluateVisibility() {
        if (!this._container) return;
        const isMobile = window.innerWidth <= 768;
        const shouldShow = isMobile && this._isSidebarCollapsed;
        
        if (shouldShow !== this._isVisible) {
            this._isVisible = shouldShow;
            this._container.style.display = shouldShow ? 'flex' : 'none';
            if (shouldShow) {
                requestAnimationFrame(() => {
                    this._container.style.opacity = '1';
                    this._container.style.transform = 'translateY(0)';
                    // При показе панели - отрисовываем последних известных участников
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
        // Сохраняем последних участников для показа при открытии панели
        this._lastMembers = members;
        
        if (!this._container || !this._isVisible) return;
        
        // Дебаунсим обновления - предотвращаем множественные вызовы
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
            
            // Проверяем, изменился ли состав участников
            const newMemberIds = new Set(limitedMembers.map(m => m.userId).filter(id => id));
            const hasChanged = this._hasMembersChanged(newMemberIds);
            
            if (!hasChanged) return; // Нет изменений - ничего не делаем
            
            // Удаляем иконки участников, которых больше нет в онлайне
            const existingIcons = Array.from(this._container.children);
            for (const icon of existingIcons) {
                const userId = icon.dataset.userId;
                if (userId && !newMemberIds.has(userId)) {
                    icon.remove();
                }
            }
            
            // Загружаем аватары для всех участников заранее
            const userIds = limitedMembers.map(m => m.userId).filter(id => id);
            const needFetch = userIds.some(id => !AvatarManager.getUrl(id));
            if (needFetch) {
                await AvatarManager.fetchUsers(userIds);
            }
            
            // Обновляем существующие и добавляем новые
            for (const member of limitedMembers) {
                const userId = member.userId;
                if (!userId) continue;
                
                let icon = this._container.querySelector(`.mobile-online-icon[data-user-id="${userId}"]`);
                
                if (!icon) {
                    // Создаём новую иконку
                    icon = document.createElement('div');
                    icon.className = 'mobile-online-icon';
                    icon.dataset.userId = userId;
                    icon.title = member.username;
                    this._container.appendChild(icon);
                    
                    // Сразу заполняем содержимое
                    this._fillIconContent(icon, member);
                } else {
                    // Обновляем title если нужно
                    if (icon.title !== member.username) {
                        icon.title = member.username;
                    }
                    
                    // Проверяем, нужно ли обновить содержимое
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

    static _fillIconContent(icon, member) {
        const userId = member.userId;
        const avatarUrl = AvatarManager.getUrl(userId);
        
        // Очищаем иконку
        icon.innerHTML = '';
        
        if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = member.username;
            img.className = 'mobile-online-avatar-img';
            img.onerror = () => {
                img.remove();
                icon.textContent = member.username.charAt(0).toUpperCase();
            };
            icon.appendChild(img);
        } else {
            icon.textContent = member.username.charAt(0).toUpperCase();
        }
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
        this._currentMemberIds.clear();
        this._lastMembers = null;
        this._updatePending = false;
    }
}

export default MobileOnlineBar;
