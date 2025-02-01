const Store = require('electron-store');
const OpenDMsScreen = require('../screens/OpenDMsScreen');
const ServersScreen = require('../screens/ServersScreen');
const ClosedDMsScreen = require('../screens/ClosedDMsScreen');
const WipeScreen = require('../screens/WipeScreen');
const HelpScreen = require('../screens/HelpScreen');
const Console = require('./Console');
const MediaViewerScreen = require('../screens/MediaViewerScreen');
const IndexSearchScreen = require('../screens/IndexSearchScreen');

class Navigation {
    constructor(token, userId, userData, preloadedData = null) {
        this.token = token;
        this.userId = userId;
        this.userData = userData;
        this.currentScreen = null;
        this.currentScreenInstance = null;
        this.menuItems = [
            { id: 'open-dms', label: 'Open DMs', icon: '💬' },
            { id: 'servers', label: 'Accessible Servers', icon: '🖥️' },
            { id: 'media-viewer', label: 'Media Viewer', icon: '🖼️' },
            { id: 'index-search', label: 'Enhanced Search', icon: '🔎' },
            { id: 'wipe', label: 'Wipe Account', icon: '🗑️' },
            { id: 'closed-dms', label: 'Find Closed DMs', icon: '🕵️' },
            { id: 'help', label: 'How to Use', icon: '❔' },
        ];
        
        // Use provided preloaded data or initialize empty
        this.preloadedData = preloadedData || {
            dms: null,
            servers: null
        };
        
        // Make the navigation instance globally available
        window.navigationInstance = this;
        
        console.log("userdata:", userData);
        if (userData) {
            this.updateUserInfo(userData);
        }
        this.isNavCollapsed = false;
    }

    updateUserInfo(userData) {
        const userInfoElement = document.querySelector('.user-info');
        if (userInfoElement && userData) {
            console.log(userData)
            const avatarUrl = userData.avatar 
                ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
                : 'https://cdn.discordapp.com/embed/avatars/0.png';
            
            userInfoElement.innerHTML = `
                <div class="user-profile">
                    <img src="${avatarUrl}" alt="Profile" class="user-avatar">
                    <span class="username">${userData.username}</span>
                </div>
            `;
        }
    }

    render() {
        const content = document.getElementById('content');
        
        // Update the app layout HTML to include the toggle button
        content.innerHTML = `
            <div class="app-layout">
                <nav class="sidebar">
                    <button class="toggle-nav" title="Toggle Navigation">
                        ◀
                    </button>
                    <div class="brand">
                        <div class="logo">DT</div>
                        <div class="brand-text">Discord Tool</div>
                    </div>
                    <div class="user-info">
                        <!-- User info will be populated by updateUserInfo -->
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

        // Update user info after DOM is created
        this.updateUserInfo(this.userData);

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
                
                // Check if navigation is blocked due to operation in progress
                if (this.currentScreenInstance && 
                    typeof this.currentScreenInstance.isOperationInProgress === 'function' && 
                    this.currentScreenInstance.isOperationInProgress()) {
                    Console.warn('Please stop the current operation before navigating away');
                    return;
                }
                
                // Only update menu and navigate if not blocked
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

        // Add new toggle navigation event listener
        const toggleNav = document.querySelector('.toggle-nav');
        toggleNav.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            const mainContent = document.getElementById('main-content');
            this.isNavCollapsed = !this.isNavCollapsed;
            
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
            
            // Update toggle button text
            toggleNav.textContent = this.isNavCollapsed ? '▶' : '◀';
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
                this.currentScreenInstance = new OpenDMsScreen(
                    this.token, 
                    this.userId,
                    this.preloadedData
                );
                this.currentScreenInstance.render(mainContent);
                break;
            case 'servers':
                Console.show();
                this.currentScreenInstance = new ServersScreen(
                    this.token, 
                    this.userId,
                    this.preloadedData
                );
                this.currentScreenInstance.render(mainContent);
                break;
            case 'closed-dms':
                Console.show();
                this.currentScreenInstance = new ClosedDMsScreen(
                    this.token, 
                    this.userId,
                    this.preloadedData
                );
                this.currentScreenInstance.render(mainContent);
                break;
            case 'index-search':
                Console.show();
                this.currentScreenInstance = new IndexSearchScreen(
                    this.token, 
                    this.userId,
                    this.preloadedData
                );
                this.currentScreenInstance.render(mainContent);
                break;
            case 'media-viewer':
                Console.show();
                this.currentScreenInstance = new MediaViewerScreen(
                    this.token, 
                    this.userId,
                    this.preloadedData
                );
                this.currentScreenInstance.render(mainContent);
                break;
            case 'wipe':
                Console.show();
                this.currentScreenInstance = new WipeScreen(
                    this.token, 
                    this.userId,
                    this.preloadedData
                );
                this.currentScreenInstance.render(mainContent);
                break;
            case 'help':
                Console.hide(); // Hide console for help screen
                this.currentScreenInstance = new HelpScreen(this.token, this.userId);
                this.currentScreenInstance.render(mainContent);
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