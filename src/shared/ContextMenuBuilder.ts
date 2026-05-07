export interface ContextMenuItem {
    label: string;
    icon?: string;
    onClick: () => void;
    isDanger?: boolean;
}

export function createContextMenu(x: number, y: number, items: ContextMenuItem[]): HTMLElement {
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
        position: fixed;
        background: #2d2d44;
        border: 1px solid #404060;
        border-radius: 8px;
        padding: 8px 0;
        min-width: 200px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    `;

    items.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = 'context-menu-item';
        el.innerHTML = `${item.icon || ''} ${item.label}`;
        el.style.cssText = `
            padding: 10px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            color: ${item.isDanger ? '#ed4245' : '#e0e0e0'};
            transition: background 0.2s;
        `;
        el.addEventListener('mouseenter', () => {
            el.style.background = item.isDanger ? 'rgba(237, 66, 69, 0.1)' : '#3d3d5c';
        });
        el.addEventListener('mouseleave', () => {
            el.style.background = 'transparent';
        });
        el.addEventListener('click', () => {
            item.onClick();
            menu.remove();
        });
        menu.appendChild(el);
    });

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    let posX = x;
    let posY = y;
    if (posX + rect.width > window.innerWidth) posX = window.innerWidth - rect.width - 10;
    if (posY + rect.height > window.innerHeight) posY = window.innerHeight - rect.height - 10;
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    const closeHandler = () => {
        menu.remove();
        document.removeEventListener('click', closeHandler);
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 100);

    return menu;
}
