class ModalManager {
    static _activeErrors = new Map();

    static openCreateRoomModal(client, onSubmit) {
        let overlay = document.querySelector('.modal-overlay');
        let content = document.querySelector('.modal-content');

        if (!overlay || !content) {
            overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10000;';

            content = document.createElement('div');
            content.className = 'modal-content';
            content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; border: 1px solid #404060;';
            content.innerHTML = `
                <h2 style="margin: 0 0 20px 0; color: #e0e0e0;">Свить гнездо</h2>
                <input type="text" id="createRoomNameInput" placeholder="Название гнезда" style="width: 100%; padding: 10px; margin-bottom: 15px; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px; font-size: 14px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="createRoomCancelBtn" style="padding: 10px 20px; background: #404060; color: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Отмена</button>
                    <button id="createRoomSubmitBtn" style="padding: 10px 20px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Свить</button>
                </div>
            `;
            overlay.appendChild(content);
            document.body.appendChild(overlay);
        } else {
            content.innerHTML = `
                <h2>Свить гнездо</h2>
                <input type="text" id="createRoomNameInput" placeholder="Название гнезда" style="width: 100%; padding: 10px; margin: 15px 0; background: #1a1a2e; border: 1px solid #404060; color: #e0e0e0; border-radius: 6px;">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="modal-cancel">Отмена</button>
                    <button class="modal-submit">Свить</button>
                </div>
            `;
            overlay.classList.remove('hidden');
        }

        const input = content.querySelector('#createRoomNameInput');
        const submitBtn = content.querySelector('#createRoomSubmitBtn') || content.querySelector('.modal-submit');
        const cancelBtn = content.querySelector('#createRoomCancelBtn') || content.querySelector('.modal-cancel');

        const handleSubmit = () => {
            const name = input.value.trim();
            if (name.length < 3) return alert('Название должно быть от 3 символов');
            this.closeModal();
            if (onSubmit) onSubmit(name);
        };

        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', () => this.closeModal());
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSubmit(); });
        input.focus();
    }

    static openSettingsModal(client) {
        const existing = document.getElementById('settings-modal');
        if (existing) {
            existing.remove();
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10001; backdrop-filter: blur(2px);';

        modal.innerHTML = `
            <div style="background: #2d2d44; border: 1px solid #404060; border-radius: 12px; padding: 24px; width: 320px; max-width: 90%; position: relative; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                <button id="close-settings-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: #aaa; font-size: 22px; cursor: pointer; line-height: 1;">&times;</button>
                <h3 style="margin: 0 0 24px 0; color: #e0e0e0; font-size: 16px; font-weight: 600; text-align: center;">⚙️ Настройки</h3>
                <button id="force-refresh-btn" style="width: 100%; padding: 12px; background: #5865f2; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s, transform 0.1s; display: flex; align-items: center; justify-content: center; gap: 8px;">⚡ Принудительно обновить</button>
                <div style="margin-top: 12px; font-size: 12px; color: #888; text-align: center; line-height: 1.4;">Очистит Service Worker кэш и перезагрузит страницу</div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('#close-settings-modal');
        const refreshBtn = modal.querySelector('#force-refresh-btn');

        const closeModal = () => {
            modal.style.opacity = '0';
            setTimeout(() => modal.remove(), 200);
        };

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        refreshBtn.addEventListener('mouseenter', () => refreshBtn.style.background = '#4752c4');
        refreshBtn.addEventListener('mouseleave', () => refreshBtn.style.background = '#5865f2');
        refreshBtn.addEventListener('mousedown', () => refreshBtn.style.transform = 'scale(0.98)');
        refreshBtn.addEventListener('mouseup', () => refreshBtn.style.transform = 'scale(1)');
        refreshBtn.addEventListener('click', () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳ Очистка...';
            try {
                if ('caches' in window) {
                    caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
                }
                sessionStorage.clear();
                const url = new URL(window.location.href);
                url.searchParams.set('v', Date.now());
                window.location.href = url.toString();
            } catch (e) {
                window.location.reload(true);
            }
        });
    }

    static openModal(title, content, onSubmit) {
        let overlay = document.querySelector('.modal-overlay');
        let contentBox = document.querySelector('.modal-content');

        if (!overlay || !contentBox) {
            overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10000;';
            contentBox = document.createElement('div');
            contentBox.className = 'modal-content';
            contentBox.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; border: 1px solid #404060;';
            overlay.appendChild(contentBox);
            document.body.appendChild(overlay);
        }

        contentBox.innerHTML = `<h2>${title}</h2>${content}<button class="modal-submit">OK</button>`;
        overlay.classList.remove('hidden');

        const submitBtn = contentBox.querySelector('.modal-submit');
        if (submitBtn && onSubmit) submitBtn.addEventListener('click', onSubmit);
    }

    static closeModal() {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
        }
    }

    static showError(message) {
        if (this._activeErrors.has(message)) return;

        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = message;
        errorEl.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ed4245; color: white; padding: 10px 15px; border-radius: 5px; z-index: 10002; max-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 14px;';
        document.body.appendChild(errorEl);

        const timeoutId = setTimeout(() => {
            if (errorEl.parentNode) errorEl.remove();
            this._activeErrors.delete(message);
        }, 5000);

        this._activeErrors.set(message, timeoutId);
    }
}

export default ModalManager;
