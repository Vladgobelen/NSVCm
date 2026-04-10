import MessageRenderer from './MessageRenderer.js';

class ReplyManager {
    static replyTarget = null;

    static getReplyTarget() {
        return this.replyTarget;
    }

    static setReplyTarget(msg) {
        if (!msg) return;
        this.replyTarget = {
            id: msg.id,
            userId: msg.userId,
            username: msg.username,
            text: msg.text
        };

        this._removePreviewBar();

        const bar = document.createElement('div');
        bar.className = 'reply-preview-bar';
        bar.innerHTML = `
            <span class="reply-target-user">${MessageRenderer.escapeHtml(msg.username)}</span>
            <span class="reply-target-text">${MessageRenderer.escapeHtml(msg.text?.substring(0, 60) || '')}...</span>
            <button class="reply-close-btn">✕</button>
        `;
        bar.style.cssText = `
            background: #3a3a5c;
            border-top: 2px solid #5865f2;
            padding: 8px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            color: #e0e0e0;
            border-radius: 8px 8px 0 0;
            margin-bottom: -8px;
            position: relative;
            z-index: 10;
        `;

        const inputArea = document.querySelector('.input-area') || document.querySelector('.secondary-input-area');
        if (inputArea) {
            inputArea.style.borderRadius = '0';
            inputArea.parentNode.insertBefore(bar, inputArea);
        }

        bar.querySelector('.reply-close-btn').addEventListener('click', () => this.clearReplyTarget());

        const input = document.querySelector('.message-input');
        if (input) {
            setTimeout(() => {
                input.focus();
                input.selectionStart = input.value.length;
            }, 50);
        }
    }

    static clearReplyTarget() {
        this.replyTarget = null;
        this._removePreviewBar();

        const inputArea = document.querySelector('.input-area') || document.querySelector('.secondary-input-area');
        if (inputArea) {
            inputArea.style.borderRadius = '';
        }
    }

    static _removePreviewBar() {
        const existing = document.querySelector('.reply-preview-bar');
        if (existing) existing.remove();
    }

    static showReplyInfoModal(message) {
        if (!message) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';

        const content = document.createElement('div');
        content.style.cssText = 'background: #2d2d44; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; border: 1px solid #404060;';

        const textBlock = message.text 
            ? `<div style="margin-top: 12px; background: #1a1a2e; padding: 10px; border-radius: 6px; white-space: pre-wrap;">${MessageRenderer.escapeHtml(message.text)}</div>` 
            : '';

        content.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: #e0e0e0;">↩️ Исходное сообщение</h3>
            <div style="color: #b0b0c0; line-height: 1.8;">
                <div style="margin-top: 12px;"><strong>Автор:</strong> ${MessageRenderer.escapeHtml(message.username)}</div>
                <div style="margin-top: 8px;"><strong>Время:</strong> ${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
                ${textBlock}
            </div>
            <button class="reply-modal-close" style="margin-top: 20px; padding: 10px 24px; background: #5865f2; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Закрыть</button>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        const closeBtn = content.querySelector('.reply-modal-close');
        closeBtn.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
}

export default ReplyManager;
