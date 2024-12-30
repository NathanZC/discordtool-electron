class Navigation {
    constructor(token) {
        this.token = token;
        this.currentScreen = null;
    }

    render() {
        const content = document.getElementById('content');
        const nav = document.createElement('nav');
        nav.className = 'main-nav';
        nav.innerHTML = `
            <ul>
                <li><a href="#" data-screen="home">Home</a></li>
                <li><a href="#" data-screen="messages">Messages</a></li>
                <li><a href="#" data-screen="settings">Settings</a></li>
                <li><a href="#" data-screen="logout">Logout</a></li>
            </ul>
        `;

        content.insertBefore(nav, content.firstChild);
        this.setupEventListeners();
    }

    setupEventListeners() {
        const nav = document.querySelector('.main-nav');
        nav.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                e.preventDefault();
                const screen = e.target.getAttribute('data-screen');
                this.navigateTo(screen);
            }
        });
    }

    navigateTo(screen) {
        const mainContent = document.getElementById('main-content');
        
        // Handle logout separately
        if (screen === 'logout') {
            // Clear token and reload to auth screen
            const store = new Store();
            store.delete('discord_token');
            window.location.reload();
            return;
        }

        // Here you would load the appropriate screen component
        mainContent.innerHTML = `<h1>${screen.charAt(0).toUpperCase() + screen.slice(1)} Screen</h1>`;
        this.currentScreen = screen;
    }
}

module.exports = Navigation; 