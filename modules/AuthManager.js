import InviteManager from '../dist/shared/InviteManager.js';

class AuthManager {
  static LAST_USER_KEY = 'voicechat_lastuser';

  static loadLastUser() {
    try {
      return JSON.parse(localStorage.getItem(this.LAST_USER_KEY));
    } catch {
      return null;
    }
  }

  static saveLastUser(user) {
    localStorage.setItem(this.LAST_USER_KEY, JSON.stringify({
      username: user.username,
      userId: user.userId,
      token: user.token,
      tokenVersion: user.tokenVersion
    }));
  }

  static removeUser(username) {
    const lastUser = this.loadLastUser();
    if (lastUser && lastUser.username === username) {
      localStorage.removeItem(this.LAST_USER_KEY);
    }
  }

  static async tryAutoLogin(client) {
    const lastUser = this.loadLastUser();
    if (!lastUser) return false;

    const isValid = await this.validateToken(client, lastUser.userId, lastUser.token, lastUser.tokenVersion);
    if (!isValid) {
      document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
      AuthManager.showAuthModal(client);
      return false;
    }

    client.userId = lastUser.userId;
    client.token = lastUser.token;
    client.username = lastUser.username;
    client.tokenVersion = lastUser.tokenVersion || 1;
    InviteManager.init(client);
    return true;
  }

  static async validateToken(client, userId, token, tokenVersion = 1) {
    try {
      const response = await fetch(`${client.API_SERVER_URL}/api/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, token, tokenVersion })
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.valid === true;
    } catch {
      return false;
    }
  }

  static async registerUser(client, username, password) {
    try {
      const response = await fetch(`${client.API_SERVER_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('API вернул неверный формат данных');
      }
      if (!response.ok) {
        throw new Error(data.error || `Ошибка системы: ${response.status}`);
      }
      this.saveLastUser({
        username,
        userId: data.userId,
        token: data.token,
        tokenVersion: data.tokenVersion || 1
      });
      client.userId = data.userId;
      client.token = data.token;
      client.username = username;
      client.tokenVersion = data.tokenVersion || 1;
      InviteManager.init(client);
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async restoreLastRoom(client) {
    try {
      const lastRoomRes = await fetch(`${client.API_SERVER_URL}/api/users/me/last-room`, {
        headers: { 'Authorization': `Bearer ${client.token}` }
      });
      if (lastRoomRes.ok) {
        const lastRoomData = await lastRoomRes.json();
        if (lastRoomData.lastRoom?.serverId && lastRoomData.lastRoom?.roomId) {
          localStorage.setItem('lastServerId', lastRoomData.lastRoom.serverId);
          localStorage.setItem('lastRoomId', lastRoomData.lastRoom.roomId);
        }
      }
    } catch (e) {
    }
  }

  static showAuthModal(client) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
    const lastUser = this.loadLastUser();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    fetch("/templates/auth-modal.html")
      .then(response => response.text())
      .then(html => {
        modal.innerHTML = html;
        const lastUserHint = modal.querySelector("#lastUserHint");
        if (lastUser && lastUserHint) {
          lastUserHint.textContent = "Последний пользователь: " + lastUser.username;
          lastUserHint.style.display = "block";
        }
        const usernameEl = modal.querySelector("#usernameInput");
        if (lastUser && usernameEl) usernameEl.value = lastUser.username;
        document.body.appendChild(modal);
        setupAuthEvents();
      }).catch(() => {});
    function setupAuthEvents() {
      const usernameInput = modal.querySelector('#usernameInput');
      const passwordInput = modal.querySelector('#passwordInput');
      const submitBtn = modal.querySelector('#authSubmitBtn');
      modal.querySelector('#createNewUserBtn').addEventListener('click', () => {
        usernameInput.value = '';
        passwordInput.value = '';
        usernameInput.focus();
      });
      const handleSubmit = async () => {
        const u = usernameInput.value.trim();
        const p = passwordInput.value.trim();
        if (u.length < 3 || p.length < 4) {
          alert('Ник — от 3, пароль — от 4');
          return;
        }
        try {
          const success = await AuthManager.registerUser(client, u, p);
          if (success) {
            document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
            await import('./ServerManager.js').then(module => module.default.loadServers(client));
            
            await AuthManager.restoreLastRoom(client);
            
            const lastServerId = localStorage.getItem('lastServerId');
            const lastRoomId = localStorage.getItem('lastRoomId');
            
            const inviteApplied = await InviteManager.applyPendingInvite();
            if (inviteApplied) return;
            
            if (client.currentServerId) {
              const serverExists = client.servers.some(s => s.id === client.currentServerId);
              if (!serverExists) {
                await import('./ServerManager.js').then(module => module.default.joinServer(client, client.currentServerId));
              }
              client.currentServer = client.servers.find(s => s.id === client.currentServerId);
              await import('./RoomManager.js').then(module => module.default.loadRoomsForServer(client, client.currentServerId));
              
              if (lastRoomId) {
                const roomExists = client.rooms?.some(r => r.id === lastRoomId);
                if (roomExists) {
                  client.currentRoom = lastRoomId;
                  await client.reconnectToRoom(lastRoomId);
                  return;
                }
              }
            }
            
            if (client.inviteServerId) {
              const serverExists = client.servers.some(s => s.id === client.inviteServerId);
              if (serverExists) {
                client.currentServerId = client.inviteServerId;
                await import('./RoomManager.js').then(module => module.default.loadRoomsForServer(client, client.inviteServerId));
                return;
              }
            }
            
            if (lastServerId) {
              const serverExists = client.servers.some(s => s.id === lastServerId);
              if (serverExists) {
                client.currentServerId = lastServerId;
                client.currentServer = client.servers.find(s => s.id === lastServerId);
                await import('./RoomManager.js').then(module => module.default.loadRoomsForServer(client, lastServerId));
                if (lastRoomId) {
                  const roomExists = client.rooms?.some(r => r.id === lastRoomId);
                  if (roomExists) {
                    client.currentRoom = lastRoomId;
                    await client.reconnectToRoom(lastRoomId);
                    return;
                  }
                }
              }
            }
            
            if (client.currentRoom) {
              await client.reconnectToRoom(client.currentRoom);
            }
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      };
      submitBtn.addEventListener('click', handleSubmit);
      passwordInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') handleSubmit();
      });
    }
    InviteManager.init(client);
  }

}
export default AuthManager;
