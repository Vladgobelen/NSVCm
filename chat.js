// chat.js
/**
 * Модуль подключения к чату и медиа
 * @param {VoiceChatClient} client
 * @param {string} roomId
 */
async function connect(client, roomId) {
  try {
    // ✅ Исправлено: используем UIManager
    UIManager.addMessage(client, 'System', 'Подключение к комнате...');

    // Подключаемся к серверу чата
    const res = await fetch(client.CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${client.token}`
      },
      body: JSON.stringify({
        roomId,
        userId: client.userId,
        token: client.token,
        clientId: client.clientID
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || res.statusText);
    }

    const data = await res.json();
    client.currentRoom = roomId;
    client.mediaServerUrl = data.mediaServerUrl;

    // Подключаемся к медиа
    await MediaManager.connect(client, roomId);

    // Уведомляем об успешном подключении
    UIManager.addMessage(client, 'System', 'Вы вошли в комнату');
    UIManager.onRoomJoined(client, data.roomName);

  } catch (error) {
    console.error('[CHAT] Ошибка подключения:', error);
    // ✅ Исправлено: используем UIManager
    UIManager.addMessage(client, 'System', `Ошибка подключения к комнате: ${error.message}`);
    UIManager.updateStatus(client, 'Ошибка подключения', 'disconnected');
  }
}
