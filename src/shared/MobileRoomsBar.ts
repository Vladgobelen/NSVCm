import UIManager from '../../modules/UIManager.js';

class MobileRoomsBar {
    private static _container: HTMLElement | null = null;
    private static _isVisible: boolean = false;
    private static _isSidebarCollapsed: boolean = false;
    private static _client: any = null;
    private static _mutationObserver: MutationObserver | null = null;
    private static _resizeHandler: (() => void) | null = null;
    private static _touchHandlers: { start: (e: TouchEvent) => void; move: (e: TouchEvent) => void; end: () => void } | null = null;

    static init(client: any): void {
        this._client = client;
        this._createContainer();
        this._bindSidebarObserver();
        this._bindResize();
        this._bindSwipe();
        this._syncWithDOM();
    }

    private static _createContainer(): void {
        if (this._container) return;
        this._container = document.createElement('div');
        this._container.id = 'mobile-rooms-bar';
        this._container.className = 'mobile-rooms-bar';
        this._container.style.cssText = `
            position: fixed;
            top: 84px;
            left: 0px;
            display: none;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 8px 4px;
            border-radius: 0 12px 12px 0;
            border: 1px solid transparent;
            background: transparent;
            z-index: 1000;
            max-height: calc(100vh - 100px);
            overflow-y: hidden;
            scrollbar-width: thin;
            scrollbar-color: #404060 #1a1a2e;
            transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, opacity 0.25s ease, transform 0.25s ease;
            opacity: 0;
            transform: translateY(-10px);
        `;
        
        this._container.addEventListener('mouseenter', () => {
            if (this._container) {
                this._container.style.background = 'rgba(35, 35, 55, 0.95)';
                this._container.style.borderColor = '#404060';
                this._container.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.5)';
                this._container.style.overflowY = 'auto';
            }
        });

        this._container.addEventListener('mouseleave', () => {
            if (this._container) {
                this._container.style.background = 'transparent';
                this._container.style.borderColor = 'transparent';
                this._container.style.boxShadow = 'none';
                this._container.style.overflowY = 'hidden';
            }
        });

        document.body.appendChild(this._container);
    }

    private static _bindSwipe(): void {
        let touchStartY = 0;
        let currentIndex = -1;
        let lastHighlighted = -1;
        let isSwipeActive = false;

        this._touchHandlers = {
            start: (e: TouchEvent) => {
                if (!this._container || this._container.style.display === 'none') return;
                if (e.touches[0].clientX > 40) return;
                
                e.preventDefault();
                isSwipeActive = true;
                touchStartY = e.touches[0].clientY;
                currentIndex = -1;
                lastHighlighted = -1;
            },
            move: (e: TouchEvent) => {
                if (!isSwipeActive || !this._container) return;
                e.preventDefault();
                
                const touchY = e.touches[0].clientY;
                const deltaY = touchY - touchStartY;
                const iconHeight = 14;
                const icons = this._container.querySelectorAll('.mobile-room-icon');
                
                if (icons.length === 0) return;
                
                currentIndex = Math.floor(deltaY / iconHeight);
                if (currentIndex < 0) currentIndex = 0;
                if (currentIndex >= icons.length) currentIndex = icons.length - 1;
                
                if (currentIndex !== lastHighlighted) {
                    if (lastHighlighted >= 0 && icons[lastHighlighted]) {
                        (icons[lastHighlighted] as HTMLElement).style.transform = '';
                        (icons[lastHighlighted] as HTMLElement).style.width = '';
                        (icons[lastHighlighted] as HTMLElement).style.height = '';
                        (icons[lastHighlighted] as HTMLElement).style.zIndex = '';
                    }
                    if (icons[currentIndex]) {
                        (icons[currentIndex] as HTMLElement).style.transform = 'scale(1.8)';
                        (icons[currentIndex] as HTMLElement).style.width = '32px';
                        (icons[currentIndex] as HTMLElement).style.height = '32px';
                        (icons[currentIndex] as HTMLElement).style.zIndex = '10';
                    }
                    lastHighlighted = currentIndex;
                }
            },
            end: () => {
                if (!isSwipeActive || !this._container) return;
                
                if (currentIndex >= 0) {
                    const icons = this._container.querySelectorAll('.mobile-room-icon');
                    if (icons[currentIndex]) {
                        (icons[currentIndex] as HTMLElement).click();
                    }
                }
                if (lastHighlighted >= 0) {
                    const icons = this._container.querySelectorAll('.mobile-room-icon');
                    if (icons[lastHighlighted]) {
                        (icons[lastHighlighted] as HTMLElement).style.transform = '';
                        (icons[lastHighlighted] as HTMLElement).style.width = '';
                        (icons[lastHighlighted] as HTMLElement).style.height = '';
                        (icons[lastHighlighted] as HTMLElement).style.zIndex = '';
                    }
                }
                currentIndex = -1;
                lastHighlighted = -1;
                isSwipeActive = false;
            }
        };

        document.addEventListener('touchstart', this._touchHandlers.start, { passive: false });
        document.addEventListener('touchmove', this._touchHandlers.move, { passive: false });
        document.addEventListener('touchend', this._touchHandlers.end, { passive: true });
    }

    private static _bindSidebarObserver(): void {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        
        this._mutationObserver = new MutationObserver(() => this._syncWithDOM());
        this._mutationObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }

    private static _bindResize(): void {
        this._resizeHandler = () => this._evaluateVisibility();
        window.addEventListener('resize', this._resizeHandler);
    }

    private static _syncWithDOM(): void {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        this._isSidebarCollapsed = !sidebar.classList.contains('open');
        this._evaluateVisibility();
    }

    private static _evaluateVisibility(): void {
        if (!this._container) return;
        const isMobile = window.innerWidth <= 768;
        const shouldShow = isMobile && this._isSidebarCollapsed;
        
        if (shouldShow !== this._isVisible) {
            this._isVisible = shouldShow;
            this._container.style.display = shouldShow ? 'flex' : 'none';
            if (shouldShow) {
                requestAnimationFrame(() => {
                    if (this._container) {
                        this._container.style.opacity = '1';
                        this._container.style.transform = 'translateY(0)';
                    }
                    this._render();
                });
            } else {
                if (this._container) {
                    this._container.style.opacity = '0';
                    this._container.style.transform = 'translateY(-10px)';
                }
            }
        }
    }

    static update(): void {
        if (!this._container || !this._isVisible) return;
        this._render();
    }

    private static _render(): void {
        if (!this._client || !this._container) return;
        this._container.innerHTML = '';

        const servers = this._client.servers || [];
        const currentServerId = this._client.currentServerId;
        const currentServer = servers.find((s: any) => s.id === currentServerId);
        const rooms = this._client.rooms || [];

        if (currentServer) {
            const serverRooms = rooms.filter((r: any) => r.serverId === currentServerId);
            serverRooms.slice(0, 15).forEach((room: any) => {
                const isActive = room.id === this._client.currentRoom;
                const icon = this._createIcon(
                    (room.name || '?').charAt(0).toUpperCase(),
                    room.name || 'Гнездо',
                    isActive,
                    () => {
                        this._client.joinRoom(room.id, true);
                    }
                );
                icon.classList.add('room-icon');
                this._container!.appendChild(icon);
            });
        }

        const separator = document.createElement('div');
        separator.style.cssText = 'width: 80%; height: 1px; background: #404060; margin: 4px 0; flex-shrink: 0;';
        this._container.appendChild(separator);

        servers.forEach((server: any) => {
            const isActive = server.id === currentServerId;
            const icon = this._createIcon(
                (server.name || '?').charAt(0).toUpperCase(),
                server.name || 'Дерево',
                isActive,
                () => {
                    this._client.currentServerId = server.id;
                    this._client.currentServer = server;
                    localStorage.setItem('lastServerId', server.id);
                    import('../../modules/RoomManager.js').then(async (m) => {
                        await m.default.loadRoomsForServer(this._client, server.id);
                        this._client.showPanel('rooms');
                        this._render();
                    });
                }
            );
            icon.classList.add('server-icon');
            this._container!.appendChild(icon);
        });
    }

    private static _createIcon(letter: string, title: string, isActive: boolean, onClick: () => void): HTMLElement {
        const icon = document.createElement('div');
        icon.className = 'mobile-room-icon' + (isActive ? ' active' : '');
        icon.textContent = letter;
        icon.title = title;
        icon.addEventListener('click', onClick);
        return icon;
    }

    static destroy(): void {
        if (this._touchHandlers) {
            document.removeEventListener('touchstart', this._touchHandlers.start);
            document.removeEventListener('touchmove', this._touchHandlers.move);
            document.removeEventListener('touchend', this._touchHandlers.end);
            this._touchHandlers = null;
        }
        if (this._container) {
            this._container.remove();
            this._container = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._mutationObserver) {
            this._mutationObserver.disconnect();
            this._mutationObserver = null;
        }
        this._isVisible = false;
    }
}

export default MobileRoomsBar;
