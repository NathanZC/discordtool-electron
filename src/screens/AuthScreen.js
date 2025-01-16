const path = require('path');
const Store = require('electron-store');
const DiscordAPI = require('../utils/discord.js');
const Navigation = require('../components/Navigation.js');

class AuthScreen {
    constructor() {
        this.store = new Store();
        this.savedAccounts = this.store.get('saved_accounts') || [];
        console.log('Store location:', this.store.path); // This will show you where the data is stored
        console.log('AuthScreen initializing...');
        try {
            this.init();
            this.setupEventListeners();
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
                    <div class="header-row">
                        <h1>Discord Tool</h1>
                        <button id="helpButton" class="help-button">?</button>
                    </div>
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
                <div class="saved-accounts">
                    <h2>Saved Accounts</h2>
                    <div id="accountsList" class="accounts-list"></div>
                </div>
            </div>
            
            <div id="helpModal" class="help-modal">
                <div class="help-content">
                    <button class="close-help">×</button>
                    <h2>How to Get Your Discord Token</h2>
                    <ol>
                        <li>Open Discord in your browser</li>
                        <li>Press F12 or Ctl+shift+i to open Developer Tools</li>
                        <li>Go to the "Network" tab (refresh if no requests)</li>
                        <li>Click on any request to discord.com that uses auth (look for @me under Name)</li>
                        <li>To the right look under Response Headers and Look for "Authorization" in the request headers</li>
                        <li>Look for "Authorization" in the request headers</li>
                    </ol>
                    <p>⚠️ Never share your token with anyone! It provides full access to your account.</p>
                </div>
            </div>
        `;
        this.renderSavedAccounts();
    }

    renderSavedAccounts() {
        const accountsList = document.getElementById('accountsList');
        accountsList.innerHTML = this.savedAccounts.map(account => `
            <div class="account-row" data-user-id="${account.userId}">
                <img src="${this.getAvatarUrl(account)}" alt="Profile" class="account-avatar">
                <span class="account-username">${account.username}</span>
                <div class="account-actions">
                    <button class="login-btn" data-user-id="${account.userId}">Login</button>
                    <button class="delete-btn" data-user-id="${account.userId}">❌</button>
                </div>
            </div>
        `).join('');
    }

    getAvatarUrl(account) {
        return account.avatar 
            ? `https://cdn.discordapp.com/avatars/${account.userId}/${account.avatar}.png`
            : 'https://cdn.discordapp.com/embed/avatars/0.png';
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
            this.showStatus('Connected successfully!', 'success');
            
            // Preload data before navigating
            const preloadedData = {
                dms: null,
                servers: null
            };

            try {
                // Create a timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout')), 5000);
                });

                // Load both DMs and servers with timeout
                const dataPromise = Promise.all([
                    discord.getAllOpenDMs(),
                    discord.getAllAccessibleServers()
                ]);

                const [dms, servers] = await Promise.race([
                    dataPromise,
                    timeoutPromise
                ]);
                
                preloadedData.dms = dms;
                preloadedData.servers = servers;
                console.log('Pre-loaded data successfully');
            } catch (error) {
                console.error('Error pre-loading data:', error);
            }

            const rememberMe = document.getElementById('rememberMe');
            if (rememberMe.checked) {
                const accountData = {
                    token: token,
                    userId: response.userId,
                    username: response.userData.username,
                    avatar: response.userData.avatar,
                    lastUsed: new Date().toISOString()
                };
                
                this.savedAccounts = this.savedAccounts.filter(acc => acc.userId !== response.userId);
                this.savedAccounts.push(accountData);
                this.store.set('saved_accounts', this.savedAccounts);
                this.renderSavedAccounts();
            }
            
            this.store.set('discord_token', {
                token: token,
                userId: response.userId,
                lastUsed: new Date().toISOString()
            });
            
            // Navigate to app after data load attempt
            this.navigateToApp(token, response.userId, response.userData, preloadedData);
            return true;
        } else {
            this.showError('Invalid auth token');
            return false;
        }
    }

    navigateToApp(token, userId, userData, preloadedData) {
        const content = document.getElementById('content');
        content.innerHTML = '';
        
        // Initialize navigation with token, userId, userData, and preloadedData
        const nav = new Navigation(token, userId, userData, preloadedData);
        nav.render();
        
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

        // Add account list listeners
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('login-btn')) {
                const userId = e.target.dataset.userId;
                const account = this.savedAccounts.find(acc => acc.userId === userId);
                if (account) {
                    await this.handleAuth(account.token);
                }
            }
            
            if (e.target.classList.contains('delete-btn')) {
                const userId = e.target.dataset.userId;
                this.savedAccounts = this.savedAccounts.filter(acc => acc.userId !== userId);
                this.store.set('saved_accounts', this.savedAccounts);
                this.renderSavedAccounts();
            }
        });

        // Add help modal listeners
        const helpButton = document.getElementById('helpButton');
        const helpModal = document.getElementById('helpModal');
        const closeHelp = document.querySelector('.close-help');

        helpButton.addEventListener('click', () => {
            helpModal.style.display = 'flex';
        });

        closeHelp.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.style.display = 'none';
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