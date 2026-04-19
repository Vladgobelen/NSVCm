import AvatarManager from './AvatarManager.js';

class AvatarUploadModal {
    static _modal = null;
    static _previewImg = null;
    static _fileInput = null;
    static _selectedFile = null;

    static open() {
        if (this._modal) return;
        this._selectedFile = null;

        this._modal = document.createElement('div');
        this._modal.className = 'avatar-upload-modal-overlay';
        this._modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';

        const content = document.createElement('div');
        content.className = 'avatar-upload-modal-content';
        content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 20px; width: 320px; border: 1px solid #404060; display: flex; flex-direction: column; gap: 16px; align-items: center;';

        const title = document.createElement('h3');
        title.textContent = '🖼️ Изменить аватар';
        title.style.cssText = 'margin: 0; color: #e0e0e0; font-size: 18px;';

        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = 'width: 120px; height: 120px; border-radius: 50%; background: #1a1a2e; border: 2px dashed #404060; display: flex; justify-content: center; align-items: center; overflow: hidden; position: relative; cursor: pointer;';
        
        this._previewImg = document.createElement('img');
        this._previewImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: none;';
        
        const placeholder = document.createElement('div');
        placeholder.textContent = '+';
        placeholder.style.cssText = 'font-size: 40px; color: #606070; font-weight: bold;';

        previewContainer.appendChild(this._previewImg);
        previewContainer.appendChild(placeholder);

        this._fileInput = document.createElement('input');
        this._fileInput.type = 'file';
        this._fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
        this._fileInput.style.cssText = 'display: none;';

        const controls = document.createElement('div');
        controls.style.cssText = 'width: 100%; display: flex; gap: 10px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Отмена';
        cancelBtn.style.cssText = 'flex: 1; padding: 10px; background: #404060; color: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;';

        const uploadBtn = document.createElement('button');
        uploadBtn.textContent = 'Загрузить';
        uploadBtn.id = 'avatar-upload-btn';
        uploadBtn.style.cssText = 'flex: 1; padding: 10px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; opacity: 0.5; pointer-events: none;';

        controls.appendChild(cancelBtn);
        controls.appendChild(uploadBtn);

        content.appendChild(title);
        content.appendChild(previewContainer);
        content.appendChild(this._fileInput);
        content.appendChild(controls);

        this._modal.appendChild(content);
        document.body.appendChild(this._modal);

        previewContainer.addEventListener('click', () => this._fileInput.click());
        this._fileInput.addEventListener('change', (e) => this._handleFileSelect(e));
        cancelBtn.addEventListener('click', () => this.close());
        uploadBtn.addEventListener('click', () => this._handleUpload());

        this._modal.addEventListener('click', (e) => {
            if (e.target === this._modal) this.close();
        });
    }

    static _handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this._showError('Выберите файл изображения');
            this._fileInput.value = '';
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            this._showError('Файл слишком большой (макс. 2 МБ)');
            this._fileInput.value = '';
            return;
        }

        this._selectedFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            this._previewImg.src = ev.target.result;
            this._previewImg.style.display = 'block';
            const placeholder = this._previewImg.nextElementSibling;
            if (placeholder) placeholder.style.display = 'none';
            const uploadBtn = document.getElementById('avatar-upload-btn');
            if (uploadBtn) {
                uploadBtn.style.opacity = '1';
                uploadBtn.style.pointerEvents = 'auto';
            }
        };
        reader.readAsDataURL(file);
    }

    static async _handleUpload() {
        if (!this._selectedFile) return;
        const client = window.voiceClient;
        if (!client || !client.userId) {
            this._showError('Ошибка авторизации');
            return;
        }

        const uploadBtn = document.getElementById('avatar-upload-btn');
        if (uploadBtn) {
            uploadBtn.textContent = '...';
            uploadBtn.style.pointerEvents = 'none';
        }

        try {
            await AvatarManager.upload(this._selectedFile, client.userId);
            this.close();
        } catch (error) {
            this._showError(error.message);
            if (uploadBtn) {
                uploadBtn.textContent = 'Загрузить';
                uploadBtn.style.pointerEvents = 'auto';
            }
        }
    }

    static close() {
        if (this._modal) {
            this._modal.remove();
            this._modal = null;
            this._selectedFile = null;
            this._fileInput = null;
            this._previewImg = null;
        }
    }

    static _showError(message) {
        const existing = document.querySelector('.avatar-upload-error');
        if (existing) existing.remove();
        
        const error = document.createElement('div');
        error.className = 'avatar-upload-error';
        error.textContent = message;
        error.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #ed4245; color: white; padding: 8px 16px; border-radius: 4px; font-size: 13px; z-index: 10002;';
        document.body.appendChild(error);
        setTimeout(() => error.remove(), 3000);
    }
}

export default AvatarUploadModal;
