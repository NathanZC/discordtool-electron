const Store = require('electron-store');
class Navigation {
    constructor(token) {
        this.token = token;
        this.currentScreen = null;
        this.menuItems = [
            { id: 'open-dms', label: 'View Open DMs', icon: '💬' },
            { id: 'servers', label: 'Accessible Servers', icon: '🖥️' },
            { id: 'closed-dms', label: 'Find Closed DMs', icon: '🔍' },
            { id: 'wipe', label: 'Wipe Account', icon: '🗑️' },
            { id: 'help', label: 'How to Use', icon: '❔' },
        ];
    }

    render() {
        const content = document.getElementById('content');
        
        // Create sidebar container
        const sidebar = document.createElement('nav');
        sidebar.className = 'sidebar';
        
        // Create logo/brand section
        const brand = document.createElement('div');
        brand.className = 'brand';
        brand.innerHTML = `
            <div class="logo">DT</div>
            <div class="brand-text">Discord Tool</div>
        `;
        
        // Create menu items
        const menuList = document.createElement('ul');
        menuList.className = 'menu-list';
        
        menuList.innerHTML = this.menuItems.map(item => `
            <li class="menu-item" data-screen="${item.id}">
                <span class="icon">${item.icon}</span>
                <span class="label">${item.label}</span>
            </li>
        `).join('');
        
        // Create logout button
        const logout = document.createElement('div');
        logout.className = 'logout-section';
        logout.innerHTML = `
            <button class="logout-btn" data-screen="logout">
                <span class="icon">🚪</span>
                <span class="label">Logout</span>
            </button>
        `;
        
        // Assemble sidebar
        sidebar.appendChild(brand);
        sidebar.appendChild(menuList);
        sidebar.appendChild(logout);
        
        // Create main content area
        const mainContent = document.createElement('div');
        mainContent.id = 'main-content';
        
        // Clear and set up new layout
        content.innerHTML = '';
        content.className = 'app-layout';
        content.appendChild(sidebar);
        content.appendChild(mainContent);
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        const sidebar = document.querySelector('.sidebar');
        sidebar.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu-item, .logout-btn');
            if (menuItem) {
                const screen = menuItem.dataset.screen;
                this.navigateTo(screen);
                
                // Remove active class from all items
                document.querySelectorAll('.menu-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Add active class to clicked item
                if (menuItem.classList.contains('menu-item')) {
                    menuItem.classList.add('active');
                }
            }
        });
    }

    navigateTo(screen) {
        const mainContent = document.getElementById('main-content');
        
        if (screen === 'logout') {
            console.log('Logging out');
            const store = new Store();
            store.delete('discord_token');
            window.location.reload();
            return;
        }

        // Here you would load the appropriate screen component
        mainContent.innerHTML = `<h1>${this.getScreenTitle(screen)}</h1>`;
        this.currentScreen = screen;
    }

    getScreenTitle(screenId) {
        const item = this.menuItems.find(item => item.id === screenId);
        return item ? item.label : 'Unknown Screen';
    }
}

module.exports = Navigation; 