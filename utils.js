// utils.js
class Utils {
    static generateClientID() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    static escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '<',
            '>': '>',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    static updateSystemTime(element) {
        if (element) {
            const now = new Date();
            element.textContent = now.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        setTimeout(() => Utils.updateSystemTime(element), 60000);
    }
}
