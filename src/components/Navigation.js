const Store = require('electron-store');
const OpenDMsScreen = require('../screens/OpenDMsScreen');
const ServersScreen = require('../screens/ServersScreen');
const ClosedDMsScreen = require('../screens/ClosedDMsScreen');
const WipeScreen = require('../screens/WipeScreen');
const HelpScreen = require('../screens/HelpScreen');
const Console = require('./Console');

class Navigation {
    constructor(token, userId) {
        this.token = token;
        this.userId = userId;
        this.currentScreen = null;
        this.menuItems = [
            { id: 'open-dms', label: 'Open DMs', icon: '💬' },
            { id: 'servers', label: 'Accessible Servers', icon: '🖥️' },
            { id: 'closed-dms', label: 'Find Closed DMs', icon: '🔍' },
            { id: 'wipe', label: 'Wipe Account', icon: '🗑️' },
            { id: 'help', label: 'How to Use', icon: '❔' },
        ];
    }

    render() {
        const content = document.getElementById('content');
        
        // Create the app layout with proper sidebar structure
        content.innerHTML = `
            <div class="app-layout">
                <nav class="sidebar">
                    <div class="brand">
                        <div class="logo">DT</div>
                        <div class="brand-text">Discord Tool</div>
                    </div>
                    <ul class="menu-list">
                        ${this.menuItems.map(item => `
                            <li class="menu-item" data-screen="${item.id}">
                                <span class="icon">${item.icon}</span>
                                <span class="label">${item.label}</span>
                            </li>
                        `).join('')}
                    </ul>
                    <div class="logout-section">
                        <button class="logout-btn" data-screen="logout">
                            <span class="icon">🚪</span>
                            <span class="label">Logout</span>
                        </button>
                    </div>
                </nav>
                <div id="main-content">
                    <!-- Main screen content will be rendered here -->
                </div>
                <div id="console-content">
                    <!-- Console will be rendered here -->
                </div>
            </div>
        `;
        
        // Initialize console once
        Console.init();
        
        this.setupEventListeners();

        // Load initial screen (View Open DMs)
        const initialMenuItem = document.querySelector('.menu-item[data-screen="open-dms"]');
        if (initialMenuItem) {
            initialMenuItem.classList.add('active');
            setTimeout(() => {
                this.navigateTo('open-dms');
            }, 0);
        }
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

        // Clear existing content
        mainContent.innerHTML = '';

        // Show/hide console based on screen
        switch(screen) {
            case 'open-dms':
                Console.show();
                const openDMsScreen = new OpenDMsScreen(this.token, this.userId);
                openDMsScreen.render(mainContent);
                break;
            case 'servers':
                Console.show();
                const serversScreen = new ServersScreen(this.token, this.userId);
                serversScreen.render(mainContent);
                break;
            case 'closed-dms':
                Console.show();
                const closedDMsScreen = new ClosedDMsScreen(this.token, this.userId);
                closedDMsScreen.render(mainContent);
                break;
            case 'wipe':
                Console.show();
                const wipeScreen = new WipeScreen(this.token, this.userId);
                wipeScreen.render(mainContent);
                break;
            case 'help':
                Console.hide(); // Hide console for help screen
                const helpScreen = new HelpScreen(this.token, this.userId);
                helpScreen.render(mainContent);
                break;
            default:
                Console.hide(); // Hide by default
                mainContent.innerHTML = `<h1>${this.getScreenTitle(screen)}</h1>`;
        }
        
        this.currentScreen = screen;
    }

    getScreenTitle(screenId) {
        const item = this.menuItems.find(item => item.id === screenId);
        return item ? item.label : 'Unknown Screen';
    }
}

module.exports = Navigation; 