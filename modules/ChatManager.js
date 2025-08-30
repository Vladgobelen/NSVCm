import UIManager from './UIManager.js';

class ChatManager {
    static async loadMessages(client, roomId) {
        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/rooms/${roomId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${client.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.messages && Array.isArray(data.messages)) {
                    data.messages.forEach(message => {
                        const username = message.username || 'Unknown';
                        UIManager.addMessage(username, message.text, message.timestamp);
                    });
                }
            }
        } catch (error) {
            console.error('Ошибка загрузки сообщений:', error);
        }
    }

    static async sendMessage(client, text) {
        if (!text.trim() || !client.currentRoom) return;

        try {
            const response = await fetch(`${client.API_SERVER_URL}/api/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${client.token}`
                },
                body: JSON.stringify({
                    roomId: client.currentRoom,
                    text: text.trim(),
                    userId: client.userId
                })
            });

            if (!response.ok) {
                throw new Error('Ошибка отправки сообщения');
            }

            // Сообщение добавляется через сокет, поэтому здесь не нужно добавлять его в UI
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            UIManager.showError('Не удалось отправить сообщение');
        }
    }

    static setupSocketHandlers(client) {
        if (!client.socket) return;

        // Новое сообщение
        client.socket.on('new-message', (data) => {
            console.log('Получено новое сообщение:', data);
            const username = data.username || 'Unknown';
            UIManager.addMessage(username, data.text, data.timestamp);
        });

        // История сообщений при подключении
        client.socket.on('message-history', (messages) => {
            console.log('Получена история сообщений:', messages);
            messages.forEach(msg => {
                const username = msg.username || 'Unknown';
                UIManager.addMessage(username, msg.text, msg.timestamp);
            });
        });
    }
}

export default ChatManager;
