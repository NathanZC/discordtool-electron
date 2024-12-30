class Navigation {
    constructor() {
        this.screens = [
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'message-cleaner', label: 'Message Cleaner' },
            { id: 'server-manager', label: 'Server Manager' },
            { id: 'user-search', label: 'User Search' },
            { id: 'settings', label: 'Settings' },
            { id: 'about', label: 'About' }
        ];
        this.init();
    }

    init() {
        const nav = document.getElementById('navigation');
        nav.innerHTML = this.screens.map(screen => `
            <button class="nav-button" data-screen="${screen.id}">
                ${screen.label}
            </button>
        `).join('');

        nav.addEventListener('click', (e) => {
            if (e.target.classList.contains('nav-button')) {
                this.loadScreen(e.target.dataset.screen);
            }
        });
    }

    loadScreen(screenId) {
        // Implementation for screen loading
    }
}

new Navigation(); 