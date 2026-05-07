export function isPrivateRoom(roomId) {
    if (!roomId) return false;
    if (roomId.includes('bot_system')) return true;
    return roomId.startsWith('user_') && roomId.includes('_user_');
}

export function isPrivateServer(server) {
    if (!server) return false;
    return server.type === 'private' ||
           server.isPrivate === true ||
           (server.id && isPrivateRoom(server.id));
}
