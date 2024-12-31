const path = require('path');
const Store = require('electron-store');
const appPath = process.cwd();
const DiscordAPI  = require(path.join(appPath, 'src', 'utils', 'discord.js'));
const Navigation = require(path.join(appPath, 'src', 'components', 'Navigation.js'));

class AuthScreen {
    constructor() {
        this.store = new Store();
        console.log('Store location:', this.store.path); // This will show you where the data is stored
        console.log('AuthScreen initializing...');
        try {
            this.init();
            this.setupEventListeners();
            this.checkSavedToken();
            console.log('AuthScreen initialized successfully');
        } catch (error) {
            console.error('Error initializing AuthScreen:', error);
        }
    }

    init() {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <h1>Discord Tool</h1>
                    <div class="auth-form">
                        <div class="input-group">
                            <input 
                                type="password" 
                                id="authKey" 
                                placeholder="Enter your Discord auth token"
                                class="auth-input"
                            >
                        </div>
                        <div class="remember-me">
                            <input type="checkbox" id="rememberMe">
                            <label for="rememberMe">Remember me</label>
                        </div>
                        <button id="submitAuth" class="auth-button">
                            Connect
                        </button>
                        <div id="authStatus" class="auth-status"></div>
                    </div>
                </div>
            </div>
        `;
    }

    async checkSavedToken() {
        const savedAuth = this.store.get('discord_token');
        if (savedAuth && savedAuth.token) {
            const authInput = document.getElementById('authKey');
            const rememberMe = document.getElementById('rememberMe');
            authInput.value = savedAuth.token;
            rememberMe.checked = true;
        }
    }

    async handleAuth(token) {
        const discord = new DiscordAPI(token);
        const response = await discord.verifyToken(token);
        
        if (response.isValid) {
            const rememberMe = document.getElementById('rememberMe');
            if (rememberMe.checked) {
                this.store.set('discord_token', {
                    token: token,
                    userId: response.userId,
                    lastUsed: new Date().toISOString()
                });
            } else {
                this.store.delete('discord_token');
            }
            this.showStatus('Connected successfully!', 'success');
            
            setTimeout(() => {
                this.navigateToApp(token, response.userId, response.userData);
            }, 1000);
            
            return true;
        } else {
            this.showError('Invalid auth token');
            return false;
        }
    }

    navigateToApp(token, userId, userData) {
        const content = document.getElementById('content');
        content.innerHTML = '';
        
        // Initialize navigation with token, userId, and userData
        const nav = new Navigation(token, userId, userData);
        nav.render();
        
        const mainContent = document.createElement('div');
        mainContent.id = 'main-content';
        content.appendChild(mainContent);
        
        nav.navigateTo('home');
    }

    setupEventListeners() {
        const submitButton = document.getElementById('submitAuth');
        const authInput = document.getElementById('authKey');

        submitButton.addEventListener('click', async () => {
            const token = authInput.value.trim();
            if (!token) {
                this.showError('Please enter an auth token');
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'Connecting...';

            try {
                await this.handleAuth(token);
            } catch (error) {
                this.showError('Connection failed');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Connect';
            }
        });

        // Enable submit on Enter key
        authInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitButton.click();
            }
        });
    }

    showError(message) {
        this.showStatus(message, 'error');
    }

    showStatus(message, type = 'error') {
        const authStatus = document.getElementById('authStatus');
        authStatus.textContent = message;
        authStatus.className = 'auth-status'; // Reset classes
        authStatus.classList.add(type);
        
        if (type === 'error') {
            setTimeout(() => {
                authStatus.textContent = '';
                authStatus.classList.remove(type);
            }, 3000);
        }
    }
}

console.log('Loading AuthScreen...');
module.exports = AuthScreen; 