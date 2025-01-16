const BaseScreen = require('./BaseScreen');
const Console = require('../components/Console');
const DiscordAPI = require('../utils/discord');
const Store = require('electron-store');
const { dialog } = require('@electron/remote');

class MediaViewerScreen extends BaseScreen {
    constructor(token, userId, preloadedData = null) {
        super(token);
        this.api = new DiscordAPI(token, userId);
        this.store = new Store();
        
        // Store preloaded data if available
        this.cachedDMs = preloadedData?.dms || null;
        this.cachedServers = preloadedData?.servers || null;
        
        // Debug log to check stored value
        const storedAutoplay = this.store.get('autoplayVideos', false);
        Console.log(`Loading stored autoplay state: ${storedAutoplay}`);
        
        this.selectedChannel = null;
        this.mediaList = [];
        this.currentIndex = 0;
        this.saveLocation = this.loadSaveLocationSetting();
        this.mediaTypes = {
            images: true,
            videos: true,
            gifs: true
        };
        
        // Load autoplay state from store, default to false if not set
        this.autoplayVideos = storedAutoplay;
        
        this.videoVolume = this.loadVolumeSetting();
        this.currentOffset = 0;
        this.hasMoreMedia = true;
        this.isLoading = false;
        this.totalResults = 0;
        this.mediaCache = new Map();
        this.currentResizeObserver = null;
        this.preloadingIndexes = new Set();
        this.initialMediaList = [];
        this.autoplayDelay = this.loadAutoplayDelaySetting();
        this.lastFetchTime = 0;
        this.FETCH_COOLDOWN = 1500;
        this.savedFiles = [];

        // Add new setting for duplicate filtering
        this.filterDuplicates = this.store.get('filterDuplicates', true); // Default to true

        // Add IPC listener for download progress
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('download-progress', (event, { message, type }) => {
            if (type === 'success') {
                Console.success(message);
            } else if (type === 'error') {
                Console.error(message);
            }
        });

        // Add IPC listeners for console messages
        let progressEntry = null;

        ipcRenderer.on('log-to-console', (event, { message, type }) => {
            Console.log(message, type);
        });

        ipcRenderer.on('create-progress', (event, { message }) => {
            progressEntry = Console.progress(message);
        });

        ipcRenderer.on('update-progress', (event, { message }) => {
            if (progressEntry) {
                Console.updateProgress(progressEntry, message);
            }
        });

        ipcRenderer.on('clear-progress', () => {
            if (progressEntry) {
                Console.clearProgress(progressEntry);
                progressEntry = null;
            }
        });

        // Add window close listener
        ipcRenderer.on('window-close', () => {
            this.cleanup();
        });

        // Clean up any existing cache
        document.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').forEach(element => {
            if (element.src) {
                URL.revokeObjectURL(element.src);
            }
            if (element instanceof HTMLVideoElement) {
                element.pause();
                element.src = '';
                element.load();
            }
        });

        // Add a new Map to store file hashes
        this.mediaHashes = new Map();

        // Add new state tracking properties
        this.lastViewState = {
            type: 'servers', // default to servers
            scrollPosition: 0,
            expandedServers: new Set(),
            searchTerm: ''
        };

        // Add cache for expanded server channels
        this.expandedServerChannels = new Map();
    }

    // Load volume from store
    loadVolumeSetting() {
        return this.store.get('mediaViewer.videoVolume', 0.5);  // Default to 0.5 if not set
    }

    // Save volume to store
    saveVolumeSetting(volume) {
        this.store.set('mediaViewer.videoVolume', volume);
    }

    loadAutoplayDelaySetting() {
        return this.store.get('mediaViewer.autoplayDelay', 3.0); // Default to 3.0 seconds
    }

    saveAutoplayDelaySetting(delay) {
        this.store.set('mediaViewer.autoplayDelay', delay);
    }

    loadSaveLocationSetting() {
        const userKey = `mediaViewer.saveLocation.${this.api.userId}`;
        return this.store.get(userKey, null);
    }

    saveSaveLocationSetting(location) {
        const userKey = `mediaViewer.saveLocation.${this.api.userId}`;
        this.store.set(userKey, location);
    }

    // Add method to save autoplay state
    saveAutoplayState(state) {
        this.autoplayVideos = state;
        this.store.set('autoplayVideos', state);
        Console.log(`Saving autoplay state: ${state}`); // Debug log
    }

    // Update toggleAutoplay method if you have one
    toggleAutoplay() {
        const newState = !this.autoplayVideos;
        this.saveAutoplayState(newState);
        return newState;
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container media-viewer">
                <div class="channel-selection">
                    <h1>Media Viewer</h1>
                    <div class="source-buttons">
                        <button id="selectServer" class="source-btn active">
                            <span>🖥️</span> Servers
                        </button>
                        <button id="selectDM" class="source-btn">
                            <span>💬</span> Direct Messages
                        </button>
                        <button id="refreshAll" class="media-viewer-refresh" title="Refresh All">🔄</button>
                    </div>
                    <div class="channel-search-container">
                        <span class="channel-search-icon">🔍</span>
                        <input type="text" id="channelSearch" placeholder="Search channels..." class="channel-search-input">
                    </div>
                    <div id="channelList" class="channel-list">
                        <!-- Channels will be loaded here -->
                    </div>
                </div>
            </div>
        `;

        // Setup initial event listeners
        container.querySelector('#selectDM').addEventListener('click', () => this.loadChannels('dms'));
        container.querySelector('#selectServer').addEventListener('click', () => this.loadChannels('servers'));
        container.querySelector('#refreshAll').addEventListener('click', async (e) => {
            await this.refreshAllChannels(e.target);
        });
        
        // Add search functionality
        const searchInput = container.querySelector('#channelSearch');
        searchInput.addEventListener('input', () => {
            this.filterChannels(searchInput.value.toLowerCase());
        });

        // Store container reference for later use
        this.container = container;

        // Use preloaded data only for initial load
        this.loadChannels('servers');
    }

    // Add a new method to initialize media viewer content when needed
    initializeMediaViewer() {
        if (this.container.querySelector('.media-viewer-content')) return;

        const mediaViewerContent = document.createElement('div');
        mediaViewerContent.className = 'media-viewer-content hidden';
        mediaViewerContent.innerHTML = `
            <div class="media-controls">
                <div class="channel-info">
                    <button id="backToChannels" class="back-btn">
                        <span>←</span> Back
                    </button>
                    <span id="channelName"></span>
                </div>
                <div class="media-types">
                    <div class="media-type-checkboxes">
                        <label><input type="checkbox" id="typeImages" checked> 🖼️ Images</label>
                        <label><input type="checkbox" id="typeVideos" checked> 🎥 Videos</label>
                        <label><input type="checkbox" id="typeGifs" checked> 📱 GIFs</label>
                    </div>
                    <div class="autoplay-controls">
                        <label><input type="checkbox" id="autoplayVideos" ${this.autoplayVideos ? 'checked' : ''}> ▶️ Autoplay</label>
                        <div class="delay-control">
                            <span>⏱️</span>
                            <input type="range" id="autoplayDelay" min="0.2" max="10" step="0.1" value="${this.autoplayDelay}">
                            <span id="delayValue">${this.autoplayDelay}s</span>
                        </div>
                    </div>
                    <div class="volume-control">
                        <span>🔊</span>
                        <input type="range" id="videoVolume" min="0" max="100" value="50">
                        <span id="volumeValue">50%</span>
                    </div>
                </div>
                <div class="save-location">
                    <button id="selectSaveLocation">📁 Set Save Location</button>
                    <span id="currentSaveLocation">No location selected</span>
                </div>
            </div>

            <div class="media-container">
                <button id="prevMedia" class="nav-btn">←</button>
                <div id="mediaContent" class="media-content">
                    <!-- Current media will be displayed here -->
                </div>
                <button id="nextMedia" class="nav-btn">→</button>
            </div>

            <div class="media-info">
                <div class="media-info-left">
                    <span id="mediaCounter">0/0</span>
                    <div class="shortcuts-tooltip">
                        <div class="shortcuts-info">
                            <span>ℹ️</span>
                            <span>Shortcuts</span>
                            <div class="shortcuts-content">
                                <div class="shortcut-item">
                                    <span class="shortcut-key">←</span>
                                    <span>Previous</span>
                                </div>
                                <div class="shortcut-item">
                                    <span class="shortcut-key">→</span>
                                    <span>Next</span>
                                </div>
                                <div class="shortcut-item">
                                    <span class="shortcut-key">↑</span>
                                    <span>Save & Next</span>
                                </div>
                                <div class="shortcut-item">
                                    <span class="shortcut-key">↓</span>
                                    <span>Undo Save</span>
                                </div>
                                <div class="shortcut-item">
                                    <span class="shortcut-key">S</span>
                                    <span>Save All</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <span id="mediaDetails"></span>
                <div class="filter-controls">
                    <label><input type="checkbox" id="filterDuplicates" ${this.filterDuplicates ? 'checked' : ''}> Filter Duplicates</label>
                </div>
            </div>
        `;

        this.container.querySelector('.screen-container').appendChild(mediaViewerContent);
        this.setupMediaEventListeners(this.container);

        // Add keyboard navigation
        document.addEventListener('keydown', this.handleKeyPress.bind(this));

        // Add resize listener for window
        window.addEventListener('resize', () => {
            const currentElement = document.querySelector('#mediaContent img, #mediaContent video');
            if (currentElement && this.mediaList[this.currentIndex]) {
                this.adjustMediaSize(currentElement, this.mediaList[this.currentIndex]);
            }
        });
    }

    // Update the selectChannel method to initialize media viewer when needed
    selectChannel(channel) {
        this.selectedChannel = {
            ...channel,
            guildId: channel.type === 'server-channel' ? channel.serverId : null
        };
        
        // Initialize media viewer if it hasn't been done yet
        this.initializeMediaViewer();
        
        // Reset ALL media-related state
        this.mediaList = [];
        this.currentIndex = 0;
        this.currentOffset = 0;
        this.hasMoreMedia = true;
        this.mediaCache.clear();
        this.mediaHashes.clear();
        this.preloadingIndexes.clear();
        this.savedFiles = []; // Also reset saved files
        this.initialMediaList = []; // Reset initial media list
        this.clearAutoplayTimer(); // Clear any existing autoplay timer
        
        document.querySelector('.channel-selection').classList.add('hidden');
        document.querySelector('.media-viewer-content').classList.remove('hidden');
        document.querySelector('#channelName').textContent = channel.name;
        
        // Reset media types to default state
        this.mediaTypes = {
            images: true,
            videos: true,
            gifs: true
        };
        
        // Update checkboxes to match default state
        Object.keys(this.mediaTypes).forEach(type => {
            const checkbox = document.querySelector(`#type${type.charAt(0).toUpperCase() + type.slice(1)}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
        
        // Clear any existing media display
        const mediaContent = document.querySelector('#mediaContent');
        if (mediaContent) {
            mediaContent.innerHTML = '<div class="loading">Loading media...</div>';
        }
        
        // Reset counter and details
        document.querySelector('#mediaCounter').textContent = '0/0';
        document.querySelector('#mediaDetails').textContent = '';
        
        this.loadMedia();
    }

    // Split the event listeners setup
    setupMediaEventListeners(container) {
        // Media type toggles
        Object.keys(this.mediaTypes).forEach(type => {
            const checkbox = container.querySelector(`#type${type.charAt(0).toUpperCase() + type.slice(1)}`);
            checkbox.addEventListener('change', async (e) => {
                this.mediaTypes[type] = e.target.checked;
                
                // Perform complete reset, similar to selectChannel
                this.mediaList = [];
                this.currentIndex = 0;
                this.currentOffset = 0;
                this.hasMoreMedia = true;
                this.mediaCache.clear();
                this.mediaHashes.clear();
                this.preloadingIndexes.clear();
                this.savedFiles = [];
                this.initialMediaList = [];
                this.clearAutoplayTimer();

                // Clear any existing media display
                const mediaContent = document.querySelector('#mediaContent');
                if (mediaContent) {
                    mediaContent.innerHTML = '<div class="loading">Loading media...</div>';
                }

                // Reset counter and details
                document.querySelector('#mediaCounter').textContent = '0/0';
                document.querySelector('#mediaDetails').textContent = '';

                Console.log('Media filters changed, performing complete reset');
                
                // Reload media with new filters
                if (this.selectedChannel) {
                    await this.loadMedia();
                }
            });
        });

        // Navigation and other controls
        container.querySelector('#prevMedia').addEventListener('click', () => this.navigateMedia(-1));
        container.querySelector('#nextMedia').addEventListener('click', () => this.navigateMedia(1));
        container.querySelector('#backToChannels').addEventListener('click', () => this.resetView());

        // Add autoplay toggle listener
        const autoplayCheckbox = container.querySelector('#autoplayVideos');
        autoplayCheckbox.addEventListener('change', (e) => {
            this.saveAutoplayState(e.target.checked);
            if (e.target.checked) {
                this.startAutoplayTimer();
            } else {
                this.clearAutoplayTimer();
            }
        });

        // Volume control listener
        const volumeSlider = container.querySelector('#videoVolume');
        const volumeValue = container.querySelector('#volumeValue');
        
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100;
            this.videoVolume = volume;
            this.saveVolumeSetting(volume);
            volumeValue.textContent = `${Math.round(volume * 100)}%`;
            
            const currentVideo = document.querySelector('#mediaContent video');
            if (currentVideo) {
                currentVideo.volume = volume;
            }
        });

        // Set initial volume value
        volumeSlider.value = this.videoVolume * 100;
        volumeValue.textContent = `${Math.round(this.videoVolume * 100)}%`;

        // Add autoplay delay control listener
        const delaySlider = container.querySelector('#autoplayDelay');
        const delayValue = container.querySelector('#delayValue');
        
        delaySlider.addEventListener('input', (e) => {
            const delay = parseFloat(e.target.value);
            this.autoplayDelay = delay;
            this.saveAutoplayDelaySetting(delay);
            delayValue.textContent = `${delay}s`;
        });

        // Add save location button listener
        const saveLocationBtn = container.querySelector('#selectSaveLocation');
        const currentSaveLocation = container.querySelector('#currentSaveLocation');
        
        // Update initial save location display
        if (this.saveLocation) {
            currentSaveLocation.textContent = this.saveLocation;
        }

        saveLocationBtn.addEventListener('click', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Save Location'
            });

            if (!result.canceled && result.filePaths.length > 0) {
                this.saveLocation = result.filePaths[0];
                this.saveSaveLocationSetting(this.saveLocation);
                currentSaveLocation.textContent = this.saveLocation;
            }
        });

        // Add duplicate filter toggle listener
        const filterDuplicatesCheckbox = container.querySelector('#filterDuplicates');
        filterDuplicatesCheckbox.addEventListener('change', async (e) => {
            this.saveFilterDuplicatesState(e.target.checked);
            if (this.selectedChannel) {
                // Reset and reload media with new filter setting
                this.mediaList = [];
                this.currentIndex = 0;
                this.currentOffset = 0;
                this.hasMoreMedia = true;
                this.mediaCache.clear();
                this.mediaHashes.clear();
                await this.loadMedia();
            }
        });
    }

    async loadChannels(type) {
        const channelList = document.querySelector('#channelList');
        channelList.innerHTML = '<div class="loading">Loading channels...</div>';
        channelList.classList.remove('hidden');

        try {
            if (type === 'dms') {
                if (!this.cachedDMs) {
                    Console.error('No cached DMs available');
                    channelList.innerHTML = '<div class="error-message">Failed to load channels</div>';
                    return;
                }
                
                const sortedDMs = this.cachedDMs.sort((a, b) => {
                    const lastA = a.last_message_id ? BigInt(a.last_message_id) : BigInt(0);
                    const lastB = b.last_message_id ? BigInt(b.last_message_id) : BigInt(0);
                    return lastB > lastA ? 1 : lastB < lastA ? -1 : 0;
                });

                this.renderChannelList(sortedDMs.map(dm => ({
                    id: dm.id,
                    name: dm.recipients.map(r => r.username).join(', ') || 'Direct Message',
                    type: 'dm',
                    lastMessageId: dm.last_message_id,
                    searchText: dm.recipients.map(r => r.username).join(' ').toLowerCase()
                })));
            } else {
                if (!this.cachedServers) {
                    Console.error('No cached servers available');
                    channelList.innerHTML = '<div class="error-message">Failed to load channels</div>';
                    return;
                }
                
                if (!this.cachedServers || this.cachedServers.length === 0) {
                    channelList.innerHTML = '<div class="info-message">No accessible servers found.</div>';
                    return;
                }

                const sortedServers = this.cachedServers.sort((a, b) => a.name.localeCompare(b.name));
                const serverChannels = sortedServers.map((server, index) => ({
                    id: server.id,
                    name: server.name,
                    type: 'server',
                    index: index + 1,
                    searchText: server.name.toLowerCase()
                }));

                this.renderChannelList(serverChannels);
            }

            // Update button states
            const dmButton = document.querySelector('#selectDM');
            const serverButton = document.querySelector('#selectServer');
            dmButton.classList.toggle('active', type === 'dms');
            serverButton.classList.toggle('active', type === 'servers');
        } catch (error) {
            Console.error('Error loading channels: ' + error.message);
            channelList.innerHTML = '<div class="error-message">Failed to load channels</div>';
        }
    }

    async loadServerChannels(serverId, serverName) {
        const serverContainer = document.querySelector(`[data-server-id="${serverId}"]`);
        
        if (!serverContainer) return;

        try {
            // Create or get the channels container
            let channelsContainer = serverContainer.querySelector('.server-channels');
            if (!channelsContainer) {
                channelsContainer = document.createElement('div');
                channelsContainer.className = 'server-channels';
                serverContainer.appendChild(channelsContainer);
            }

            channelsContainer.innerHTML = '<div class="loading">Loading channels...</div>';

            // Add "Entire Server" option
            channelsContainer.innerHTML = `
                <div class="channel-item server-wide" data-channel-id="${serverId}" data-channel-type="server-all">
                    <span class="channel-icon">📑</span>
                    <span class="channel-name">All Channels</span>
                </div>
                <div class="channels-divider">Individual Channels</div>
            `;

            let server;
            
            // Check if we have cached channels for this server
            if (this.expandedServerChannels.has(serverId)) {
                server = this.expandedServerChannels.get(serverId);
                Console.log(`Using cached channels for server ${serverName}`);
            } else {
                // Find the server in cached data
                server = this.cachedServers.find(s => s.id === serverId);
                
                // If server doesn't have channels, fetch them
                if (!server?.channels) {
                    Console.log(`Fetching channels for server ${serverName}`);
                    // Fetch channels from API and cache them
                    const serverData = await this.api.getGuildChannels(serverId);
                    server = {
                        ...server,
                        channels: serverData
                    };
                    // Cache the server channels
                    this.expandedServerChannels.set(serverId, server);
                }
            }

            if (!server || !server.channels) {
                throw new Error('Server channels not found');
            }

            // Use channels from either cache or fresh fetch
            const textChannels = server.channels
                .filter(channel => channel.type === 0) // 0 is TEXT_CHANNEL
                .sort((a, b) => a.position - b.position);

            // Add individual channels
            textChannels.forEach(channel => {
                const channelElement = document.createElement('div');
                channelElement.className = 'channel-item';
                channelElement.dataset.channelId = channel.id;
                channelElement.dataset.channelType = 'server-channel';
                channelElement.dataset.serverName = serverName;
                channelElement.dataset.channelName = channel.name;
                channelElement.innerHTML = `
                    <span class="channel-icon">#</span>
                    <span class="channel-name">${this.escapeHtml(channel.name)}</span>
                `;
                channelsContainer.appendChild(channelElement);
            });

            // Add click handlers
            channelsContainer.querySelectorAll('.channel-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent server toggle
                    const channelType = item.dataset.channelType;
                    const channelName = channelType === 'server-all' 
                        ? serverName 
                        : `${serverName} #${item.dataset.channelName}`;

                    this.selectChannel({
                        id: item.dataset.channelId,
                        type: channelType,
                        name: channelName,
                        serverId: serverId
                    });
                });
            });

        } catch (error) {
            Console.error(`Error loading channels for server ${serverName}: ${error.message}`);
            serverContainer.querySelector('.server-channels').innerHTML = 
                '<div class="error-message">Failed to load channels</div>';
        }
    }

    renderChannelList(channels) {
        const channelList = document.querySelector('#channelList');
        
        if (!channels.length) {
            channelList.innerHTML = '<div class="info-message">No channels found</div>';
            return;
        }

        channelList.innerHTML = channels.map(channel => {
            if (channel.type === 'dm') {
                return `
                    <div class="channel-item" 
                        data-channel-id="${channel.id}" 
                        data-channel-type="dm"
                        data-channel-name="${this.escapeHtml(channel.name)}">
                        <span class="channel-icon">💬</span>
                        <span class="channel-name">${this.escapeHtml(channel.name)}</span>
                    </div>
                `;
            } else {
                return `
                    <div class="server-container" data-server-id="${channel.id}">
                        <div class="channel-item server-header" 
                            data-server-id="${channel.id}"
                            data-server-name="${this.escapeHtml(channel.name)}">
                            <span class="channel-icon">
                                <span class="channel-index">${channel.index}.</span>
                            </span>
                            <span class="channel-name">${this.escapeHtml(channel.name)}</span>
                            <span class="server-expand">▼</span>
                        </div>
                    </div>
                `;
            }
        }).join('');

        // Add click handlers
        channelList.querySelectorAll('.channel-item').forEach(item => {
            if (item.closest('.server-header')) {
                item.addEventListener('click', () => {
                    const serverId = item.dataset.serverId;
                    const serverName = item.dataset.serverName;
                    const container = item.closest('.server-container');
                    
                    if (!container.querySelector('.server-channels')) {
                        this.loadServerChannels(serverId, serverName);
                        item.querySelector('.server-expand').textContent = '▲';
                    } else {
                        container.querySelector('.server-channels').remove();
                        item.querySelector('.server-expand').textContent = '▼';
                    }
                });
            } else if (item.dataset.channelType === 'dm') {
                item.addEventListener('click', () => {
                    this.selectChannel({
                        id: item.dataset.channelId,
                        type: 'dm',
                        name: item.dataset.channelName
                    });
                });
            }
        });
    }

    resetView() {
        // Add this at the start of resetView to prevent further loading
        this.isLoading = false;  // Stop any ongoing loading
        this.hasMoreMedia = false;  // Prevent further loading attempts
        this.selectedChannel = null;  // Clear selected channel

        // Save current state before resetting
        const channelListElement = document.querySelector('#channelList');
        if (channelListElement) {
            // Save scroll position
            this.lastViewState.scrollPosition = channelListElement.scrollTop;
            
            // Save which view was active
            this.lastViewState.type = document.querySelector('#selectDM').classList.contains('active') ? 'dms' : 'servers';
            
            // Save search term
            this.lastViewState.searchTerm = document.querySelector('#channelSearch')?.value || '';
            
            // Save expanded servers
            this.lastViewState.expandedServers = new Set(
                Array.from(document.querySelectorAll('.server-container'))
                    .filter(container => container.querySelector('.server-channels'))
                    .map(container => container.dataset.serverId)
            );
        }

        // Remove keyboard listener
        document.removeEventListener('keydown', this.handleKeyPress.bind(this));

        // Stop any playing videos
        const currentVideo = document.querySelector('#mediaContent video');
        if (currentVideo) {
            currentVideo.pause();
            currentVideo.src = '';
            currentVideo.load();
        }

        // Reset ALL state
        this.selectedChannel = null;
        this.mediaList = [];
        this.currentIndex = 0;
        this.currentOffset = 0;
        this.hasMoreMedia = true;
        this.mediaCache.clear();
        this.mediaHashes.clear();
        this.preloadingIndexes.clear();
        this.savedFiles = [];
        this.initialMediaList = [];
        this.clearAutoplayTimer();
        
        // Remove the media viewer content entirely
        const mediaViewerContent = this.container.querySelector('.media-viewer-content');
        if (mediaViewerContent) {
            mediaViewerContent.remove();
        }
        
        // Hide channel list
        const channelList = document.querySelector('#channelList');
        if (channelList) {
            channelList.classList.add('hidden');
        }
        
        // Show only the initial selection screen
        document.querySelector('.channel-selection').classList.remove('hidden');
        
        // Clear any search input
        const searchInput = document.querySelector('#channelSearch');
        if (searchInput) {
            searchInput.value = '';
        }

        // After showing the channel selection, restore the previous state
        document.querySelector('.channel-selection').classList.remove('hidden');
        this.restoreViewState();
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async preloadMedia(mediaItem) {
        if (!mediaItem?.url) {
            return null;
        }

        if (this.mediaCache.has(mediaItem.url)) {
            return this.mediaCache.get(mediaItem.url);
        }

        try {
            const response = await fetch(mediaItem.url, {
                referrer: "https://discord.com",
                referrerPolicy: "no-referrer-when-downgrade",
                headers: {
                    'Accept': 'image/webp,image/*,video/*,*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            
            // Only calculate and store hash if duplicate filtering is enabled
            if (this.filterDuplicates) {
                const arrayBuffer = await blob.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                this.mediaHashes.set(mediaItem.url, hashHex);
            }

            const objectUrl = URL.createObjectURL(blob);

            return new Promise((resolve) => {
                try {
                    if (mediaItem.type === 'video') {
                        const video = document.createElement('video');
                        video.addEventListener('loadeddata', () => {
                            this.mediaCache.set(mediaItem.url, video);
                            resolve(video);
                        });
                        
                        video.addEventListener('error', () => {
                            URL.revokeObjectURL(objectUrl);
                            this.mediaCache.set(mediaItem.url, null);
                            resolve(null);
                        });
                        
                        video.src = objectUrl;
                        video.preload = 'auto';
                    } else {
                        const img = new Image();
                        
                        img.onload = () => {
                            this.mediaCache.set(mediaItem.url, img);
                            resolve(img);
                        };
                        
                        img.onerror = () => {
                            URL.revokeObjectURL(objectUrl);
                            this.mediaCache.set(mediaItem.url, null);
                            resolve(null);
                        };

                        img.src = objectUrl;
                    }
                } catch (error) {
                    URL.revokeObjectURL(objectUrl);
                    this.mediaCache.set(mediaItem.url, null);
                    resolve(null);
                }
            });

        } catch (error) {
            this.mediaCache.set(mediaItem.url, null);
            return null;
        }
    }

    async preloadBatch(startIndex, count = 5) {
        // If we have few items total or we're approaching the end, fetch more
        if ((this.mediaList.length < 15 || 
             this.mediaList.length - startIndex <= 25) && 
            this.hasMoreMedia && 
            !this.isLoading) {
            await this.loadMedia(false);
        }

        const endIndex = Math.min(startIndex + count, this.mediaList.length);
        const preloadPromises = [];
        // Only create duplicates set if filtering is enabled
        const duplicates = this.filterDuplicates ? new Set() : null;

        for (let i = startIndex; i < endIndex; i++) {
            const mediaItem = this.mediaList[i];
            if (!this.preloadingIndexes.has(i) && !this.mediaCache.has(mediaItem?.url)) {
                this.preloadingIndexes.add(i);
                
                // Wrap each preload in a promise that also checks for duplicates
                const promise = this.preloadMedia(mediaItem)
                    .then(async () => {
                        // Only check for duplicates if filtering is enabled
                        if (this.filterDuplicates && duplicates) {
                            const currentHash = this.mediaHashes.get(mediaItem.url);
                            if (currentHash) {
                                for (const [existingUrl, existingHash] of this.mediaHashes.entries()) {
                                    if (existingUrl !== mediaItem.url && existingHash === currentHash) {
                                        Console.log(`Found duplicate content: ${mediaItem.filename} matches ${existingUrl}`);
                                        duplicates.add(mediaItem.url);
                                        break;
                                    }
                                }
                            }
                        }
                    })
                    .finally(() => {
                        this.preloadingIndexes.delete(i);
                    });

                preloadPromises.push(promise);
            }
        }

        if (preloadPromises.length > 0) {
            try {
                await Promise.all(preloadPromises);
                
                // Only remove duplicates if filtering is enabled and duplicates were found
                if (this.filterDuplicates && duplicates && duplicates.size > 0) {
                    const oldLength = this.mediaList.length;
                    this.mediaList = this.mediaList.filter(item => !duplicates.has(item.url));
                    Console.log(`Removed ${duplicates.size} duplicates`);
                    
                    // Adjust currentIndex if needed
                    if (this.currentIndex >= this.mediaList.length) {
                        this.currentIndex = Math.max(0, this.mediaList.length - 1);
                        await this.displayCurrentMedia();
                    } else {
                        this.updateMediaCounter();
                    }
                }
            } catch (error) {
                Console.error('Error during preload batch:', error);
            }
        }
    }

    async displayCurrentMedia() {
        if (!this.mediaList.length) return;

        const mediaContent = document.querySelector('#mediaContent');
        const currentMedia = this.mediaList[this.currentIndex];
        const counter = document.querySelector('#mediaCounter');
        const details = document.querySelector('#mediaDetails');

        if (!currentMedia?.url) {
            Console.error('Invalid media item at index', this.currentIndex);
            mediaContent.innerHTML = '<div class="error">Invalid media</div>';
            return;
        }

        counter.textContent = `${this.currentIndex + 1}/${this.mediaList.length}`;

        const date = new Date(currentMedia.timestamp).toLocaleString();
        const size = currentMedia.size ? `${(currentMedia.size / 1024 / 1024).toFixed(2)}MB` : '';
        details.textContent = `${currentMedia.filename} ${size ? `(${size})` : ''} - ${date}`;

        try {
            // Clear existing content and any previous observers
            if (this.currentResizeObserver) {
                this.currentResizeObserver.disconnect();
            }
            mediaContent.innerHTML = '';

            // Try to get from cache first
            let element = this.mediaCache.get(currentMedia.url);
            
            if (!element) {
                // Show loading state
                mediaContent.innerHTML = '<div class="loading">Loading media...</div>';
                // If not in cache, load and cache it
                element = await this.preloadMedia(currentMedia);
                if (!element) {
                    mediaContent.innerHTML = '<div class="error">Failed to load media</div>';
                    return;
                }
            }
            
            // Clear loading state
            mediaContent.innerHTML = '';
            
            // Clone the cached element to prevent issues with multiple displays
            const displayElement = element.cloneNode(true);
            
            if (currentMedia.type === 'video') {
                displayElement.controls = true;
                displayElement.volume = this.videoVolume;
                // Always autoplay videos if autoplay is enabled, regardless of timer
                displayElement.autoplay = this.autoplayVideos;
                displayElement.addEventListener('ended', () => {
                    if (this.autoplayVideos) {
                        this.navigateMedia(1);
                    }
                });
            } else if (this.autoplayVideos) {
                // Only start timer for non-video media
                this.startAutoplayTimer();
            }

            // Set initial styles
            displayElement.style.maxHeight = '100%';
            displayElement.style.maxWidth = '100%';
            displayElement.style.objectFit = 'contain';

            // Create new ResizeObserver
            this.currentResizeObserver = new ResizeObserver(() => {
                this.adjustMediaSize(displayElement, currentMedia);
            });

            // Add element to DOM
            mediaContent.appendChild(displayElement);

            // Wait for element to be loaded before observing
            if (currentMedia.type === 'video') {
                if (displayElement.readyState >= 2) { // HAVE_CURRENT_DATA or better
                    this.currentResizeObserver.observe(mediaContent);
                    this.adjustMediaSize(displayElement, currentMedia);
                } else {
                    displayElement.addEventListener('loadeddata', () => {
                        this.currentResizeObserver.observe(mediaContent);
                        this.adjustMediaSize(displayElement, currentMedia);
                    });
                }
            } else {
                if (displayElement.complete) {
                    this.currentResizeObserver.observe(mediaContent);
                    this.adjustMediaSize(displayElement, currentMedia);
                } else {
                    displayElement.addEventListener('load', () => {
                        this.currentResizeObserver.observe(mediaContent);
                        this.adjustMediaSize(displayElement, currentMedia);
                    });
                }
            }

            // Preload next few items in the background
            this.preloadBatch(this.currentIndex + 1);

        } catch (error) {
            Console.error('Error displaying media:', error);
            mediaContent.innerHTML = '<div class="error">Failed to display media</div>';
        }
    }

    adjustMediaSize(element, mediaItem) {
        try {
            const container = element.parentElement;
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            
            // Get original dimensions
            const originalWidth = mediaItem.dimensions?.width || element.naturalWidth || element.videoWidth || 0;
            const originalHeight = mediaItem.dimensions?.height || element.naturalHeight || element.videoHeight || 0;

            if (!originalWidth || !originalHeight) return;

            // Calculate aspect ratios
            const mediaRatio = originalWidth / originalHeight;
            const containerRatio = containerRect.width / containerRect.height;

            let newWidth, newHeight;

            // If media is more "widescreen" than container, fit to height
            // Otherwise, fit to width
            if (mediaRatio > containerRatio) {
                // Media is wider relative to its height than the container
                newWidth = containerRect.width;
                newHeight = containerRect.width / mediaRatio;
            } else {
                // Media is taller relative to its width than the container
                newHeight = containerRect.height;
                newWidth = containerRect.height * mediaRatio;
            }

            // Apply new dimensions
            element.style.width = `${Math.round(newWidth)}px`;
            element.style.height = `${Math.round(newHeight)}px`;

            // Center the media in the container
            element.style.position = 'absolute';
            element.style.left = '50%';
            element.style.top = '50%';
            element.style.transform = 'translate(-50%, -50%)';

        } catch (error) {
            Console.error('Error adjusting media size:', error);
        }
    }

    async loadMedia(reset = true) {
        // Add check at the start of loadMedia
        if (!this.selectedChannel) {
            Console.log('No channel selected, stopping media load');
            return;
        }

        // Check if any media types are selected
        const hasActiveFilters = Object.values(this.mediaTypes).some(type => type === true);
        if (!hasActiveFilters) {
            Console.log('No media types selected, skipping media load');
            const mediaContent = document.querySelector('#mediaContent');
            mediaContent.innerHTML = '<div class="no-media">No media types selected</div>';
            document.querySelector('#mediaCounter').textContent = '0/0';
            document.querySelector('#mediaDetails').textContent = '';
            return;
        }

        if (reset) {
            this.currentOffset = 0;
            this.mediaList = [];
            this.currentIndex = 0;
            this.hasMoreMedia = true;
            this.initialMediaList = [];
        }

        if (!this.hasMoreMedia || this.isLoading) return;

        try {
            this.isLoading = true;
            let foundMatchingMedia = false;
            let attempts = 0;
            const MAX_ATTEMPTS = 50;
            const MIN_INITIAL_ITEMS = 5;

            while ((!foundMatchingMedia || (reset && this.mediaList.length < MIN_INITIAL_ITEMS)) 
                   && this.hasMoreMedia && attempts < MAX_ATTEMPTS) {
                
                // Add delay between concurrent attempts
                if (attempts > 0) {
                    const now = Date.now();
                    const timeSinceLastFetch = now - this.lastFetchTime;
                    if (timeSinceLastFetch < this.FETCH_COOLDOWN) {
                        await new Promise(resolve => setTimeout(resolve, this.FETCH_COOLDOWN - timeSinceLastFetch));
                    }
                }
                
                Console.log(`Fetching media (offset: ${this.currentOffset})...`);
                this.lastFetchTime = Date.now();
                
                let response;
                if (this.selectedChannel.type === 'server-all') {
                    response = await this.api.getGuildMedia(
                        this.selectedChannel.id,
                        {
                            offset: this.currentOffset,
                            mediaTypes: this.mediaTypes
                        }
                    );
                } else if (this.selectedChannel.type === 'server-channel') {
                    response = await this.api.getGuildMedia(
                        this.selectedChannel.serverId,
                        {
                            channelId: this.selectedChannel.id,
                            offset: this.currentOffset,
                            mediaTypes: this.mediaTypes
                        }
                    );
                } else if (this.selectedChannel.type === 'dm') {
                    response = await this.api.getDMMedia(
                        this.selectedChannel.id,
                        {
                            offset: this.currentOffset,
                            mediaTypes: this.mediaTypes
                        }
                    );
                }

                if (reset && this.initialMediaList.length === 0) {
                    this.initialMediaList = [...response.media];
                }

                this.hasMoreMedia = response.hasMore;
                this.currentOffset = response.offset;
                this.totalResults = response.total;

                if (response.media.length > 0) {
                    // Always filter URL duplicates
                    const urlFilteredMedia = response.media.filter(item => 
                        !this.mediaList.some(existing => existing.url === item.url)
                    );

                    if (urlFilteredMedia.length > 0) {
                        let newMedia = urlFilteredMedia;

                        if (this.filterDuplicates) {
                            const duplicates = await this.processHashesInBackground(urlFilteredMedia);
                            newMedia = urlFilteredMedia.filter(item => 
                                !duplicates.some(dup => dup.url === item.url)
                            );

                            if (duplicates.length > 0) {
                                Console.log(`Filtered out ${duplicates.length} duplicate items`);
                            }
                        }

                        if (newMedia.length > 0) {
                            this.mediaList.push(...newMedia);
                            
                            if (reset) {
                                this.currentIndex = 0;
                                await this.displayCurrentMedia();
                            } else {
                                // Don't modify currentIndex, just update the counter
                                this.updateMediaCounter();
                            }
                            foundMatchingMedia = true;

                            // Start preloading the new items
                            this.preloadBatch(this.mediaList.length - newMedia.length, newMedia.length);
                        }
                    }
                }
                attempts++;
            }

            if (reset && this.mediaList.length > 0) {
                Console.success(`Initially loaded ${this.mediaList.length} media items`);
            } else if (this.mediaList.length === 0) {
                const mediaContent = document.querySelector('#mediaContent');
                mediaContent.innerHTML = '<div class="no-media">No media found</div>';
                this.updateMediaCounter();
            }

            // Add logging when hasMore becomes false
            if (!this.hasMoreMedia) {
                Console.warn('Reached the end of available media');
            }

        } catch (error) {
            Console.error('Error loading media:', error);
        } finally {
            this.isLoading = false;
        }
    }

    // Add new helper methods
    updateMediaCounter() {
        const counter = document.querySelector('#mediaCounter');
        if (counter) {
            counter.textContent = this.mediaList.length > 0 ? 
                `${this.currentIndex + 1}/${this.mediaList.length}` : 
                '0/0';
        }
    }

    async processHashesInBackground(mediaItems) {
        const duplicates = [];
        
        // If filtering is disabled, return empty duplicates array
        if (!this.filterDuplicates) {
            return duplicates;
        }
        
        for (const item of mediaItems) {
            try {
                const response = await fetch(item.url, {
                    referrer: "https://discord.com",
                    referrerPolicy: "no-referrer-when-downgrade",
                });
                
                if (!response.ok) continue;
                
                const buffer = await response.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                // Check if this hash exists in our collection
                let isDuplicate = false;
                for (const [existingUrl, existingHash] of this.mediaHashes.entries()) {
                    if (existingHash === hashHex && existingUrl !== item.url) {
                        Console.log(`Found duplicate content: ${item.filename} matches ${existingUrl}`);
                        isDuplicate = true;
                        duplicates.push(item);
                        break;
                    }
                }

                // Only store hash if we're filtering duplicates
                if (this.filterDuplicates) {
                    this.mediaHashes.set(item.url, hashHex);
                }

            } catch (error) {
                Console.error(`Error processing ${item.filename}: ${error.message}`);
                if (this.filterDuplicates) {
                    this.mediaHashes.set(item.url, null);
                }
            }
        }

        return duplicates;
    }

    async navigateMedia(direction) {
        if (!this.mediaList.length) return;

        const newIndex = this.currentIndex + direction;
        
        // Don't allow navigation past the end while loading more
        if (newIndex >= this.mediaList.length && this.isLoading) {
            return;
        }

        // Don't allow navigation past the beginning
        if (newIndex < 0) {
            return;
        }
        // For forward navigation, only proceed if we have the item
        else if (newIndex < this.mediaList.length) {
            this.currentIndex = newIndex;
        }
        // Otherwise, try to load more data but don't change the index
        else if (this.hasMoreMedia) {
            await this.preloadBatch(this.currentIndex, 5);
            // If new items were loaded, then we can proceed
            if (newIndex < this.mediaList.length) {
                this.currentIndex = newIndex;
            }
            return;
        }

        // Display current media
        await this.displayCurrentMedia();

        // Only preload in the direction we're moving
        const preloadStartIndex = direction > 0 ? 
            this.currentIndex + 1 : 
            Math.max(0, this.currentIndex - 5);
            
        this.preloadBatch(preloadStartIndex, 5);
    }

    filterChannels(searchTerm) {
        const channelItems = document.querySelectorAll('.channel-item');
        let visibleCount = 0;

        channelItems.forEach(item => {
            const name = item.querySelector('.channel-name').textContent.toLowerCase();
            const matches = name.includes(searchTerm);
            item.style.display = matches ? '' : 'none';
            if (matches) visibleCount++;
        });

        // Show no results message if needed
        const noResults = document.querySelector('.no-results');
        if (visibleCount === 0) {
            if (!noResults) {
                const message = document.createElement('div');
                message.className = 'no-results info-message';
                message.textContent = 'No matching channels found';
                document.querySelector('#channelList').appendChild(message);
            }
        } else if (noResults) {
            noResults.remove();
        }
    }

    // Add new method for keyboard navigation
    handleKeyPress(event) {
        // Only handle keys if media viewer is active
        if (!this.selectedChannel || this.container.querySelector('.media-viewer-content.hidden')) {
            return;
        }

        switch (event.key.toLowerCase()) {
            case 'arrowleft':
                this.navigateMedia(-1);
                break;
            case 'arrowright':
                this.navigateMedia(1);
                break;
            case 'arrowup':
                // Check if we have a save location and current media
                if (this.saveLocation && this.mediaList[this.currentIndex]) {
                    const currentMedia = this.mediaList[this.currentIndex];
                    const { ipcRenderer } = require('electron');
                    const { shell } = require('@electron/remote');
                    const path = require('path');
                    
                    const fullPath = path.join(this.saveLocation, currentMedia.filename);
                    
                    // Add to saved files stack with the index
                    this.savedFiles.push({
                        path: fullPath,
                        filename: currentMedia.filename,
                        index: this.currentIndex // Store the index
                    });

                    // Trigger direct download to save location
                    ipcRenderer.send('download-file', {
                        url: currentMedia.url,
                        filename: currentMedia.filename,
                        saveLocation: this.saveLocation
                    });
                    
                    // Create message with clickable path
                    const message = `Saved ${currentMedia.filename} to <span class="clickable-path" style="text-decoration: underline; cursor: pointer;">${this.saveLocation}</span>`;
                    
                    // Pass both the message and the click handler
                    Console.custom(message, 'success', () => {
                        shell.showItemInFolder(fullPath);
                    });
                    
                    // Navigate to next media
                    this.navigateMedia(1);
                } else if (!this.saveLocation) {
                    Console.error('No save location set. Please set a save location first.');
                }
                break;
            case 'arrowdown':
                // Undo last save if there are any saved files
                if (this.savedFiles.length > 0) {
                    const lastSave = this.savedFiles.pop();
                    const fs = require('fs');
                    
                    try {
                        // Check if file exists before attempting to delete
                        if (fs.existsSync(lastSave.path)) {
                            fs.unlinkSync(lastSave.path);
                            Console.custom(`Undid save: Deleted ${lastSave.filename}`, 'warning');
                            
                            // Navigate back to the undone media's index
                            if (this.currentIndex !== lastSave.index) {
                                this.currentIndex = lastSave.index;
                                this.displayCurrentMedia().catch(err => {
                                    Console.error(`Error displaying media: ${err.message}`);
                                });
                            }
                        } else {
                            Console.warn(`File ${lastSave.filename} was already deleted or moved`);
                        }
                    } catch (error) {
                        Console.error(`Failed to delete ${lastSave.filename}: ${error.message}`);
                        // Push the file back onto the stack if deletion failed
                        this.savedFiles.push(lastSave);
                    }
                } else {
                    Console.warn('No saved files to undo');
                }
                break;
            case 's':
                if (this.saveLocation) {
                    const { ipcRenderer } = require('electron');
                    let totalToSave = this.mediaList.length;
                    
                    Console.custom(`Starting batch save of ${totalToSave} files...`, 'info');

                    // Send all files in a single batch instead of individual downloads
                    ipcRenderer.send('batch-download-files', {
                        files: this.mediaList.map(media => ({
                            url: media.url,
                            filename: media.filename,
                            saveLocation: this.saveLocation
                        }))
                    });

                    // Add to saved files stack all at once
                    const path = require('path');
                    this.savedFiles.push(...this.mediaList.map((media, index) => ({
                        path: path.join(this.saveLocation, media.filename),
                        filename: media.filename,
                        index: index
                    })));

                    // Create message with clickable path
                    const message = `Queued ${totalToSave} files to save to <span class="clickable-path" style="text-decoration: underline; cursor: pointer;">${this.saveLocation}</span>`;
                    
                    Console.custom(message, 'success', () => {
                        const { shell } = require('@electron/remote');
                        shell.openPath(this.saveLocation);
                    });
                } else {
                    Console.error('No save location set. Please set a save location first.');
                }
                break;
        }
    }

    startAutoplayTimer() {
        this.clearAutoplayTimer(); // Clear any existing timer
        
        const currentMedia = this.mediaList[this.currentIndex];
        if (!currentMedia) return;

        // Only set timer for non-video media
        if (currentMedia.type !== 'video') {
            this.autoplayTimer = setTimeout(() => {
                this.navigateMedia(1);
            }, this.autoplayDelay * 1000);
        }
    }

    clearAutoplayTimer() {
        if (this.autoplayTimer) {
            clearTimeout(this.autoplayTimer);
            this.autoplayTimer = null;
        }
    }

    // Add cleanup method
    cleanup() {
        Console.log('Cleaning up MediaViewer resources...');
        
        // Clear autoplay timer
        this.clearAutoplayTimer();
        
        // Clear any playing videos
        const currentVideo = document.querySelector('#mediaContent video');
        if (currentVideo) {
            currentVideo.pause();
            currentVideo.src = '';
        }
        
        // Clear resize observer
        if (this.currentResizeObserver) {
            this.currentResizeObserver.disconnect();
            this.currentResizeObserver = null;
        }
        
        // Clear media cache more thoroughly
        for (const [url, element] of this.mediaCache.entries()) {
            if (element) {
                if (element instanceof HTMLVideoElement) {
                    element.pause();
                    element.src = '';
                    element.load(); // Force release of media resources
                }
                if (element.src && element.src.startsWith('blob:')) {
                    URL.revokeObjectURL(element.src);
                }
            }
        }
        this.mediaCache.clear();
        
        // Clear any blob URLs that might be in the DOM
        document.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').forEach(element => {
            if (element.src) {
                URL.revokeObjectURL(element.src);
            }
            if (element instanceof HTMLVideoElement) {
                element.pause();
                element.src = '';
                element.load();
            }
        });
        
        // Clear media hashes
        this.mediaHashes.clear();
        
        Console.success('MediaViewer cleanup completed');
    }

    // Add new method to save filter state
    saveFilterDuplicatesState(state) {
        this.filterDuplicates = state;
        this.store.set('filterDuplicates', state);
        Console.log(`Saving duplicate filter state: ${state}`);
    }

    // Add new method to handle refreshing all channels
    async refreshAllChannels(buttonElement) {
        try {
            buttonElement.classList.add('spinning');
            
            // Clear all caches
            this.cachedDMs = null;
            this.cachedServers = null;
            this.expandedServerChannels.clear(); // Clear expanded server cache
            
            // Fetch both in parallel
            const [dms, servers] = await Promise.all([
                this.api.getAllOpenDMs(),
                this.api.getAllAccessibleServers()
            ]);
            
            this.cachedDMs = dms;
            this.cachedServers = servers;
            
            // Update preloaded data in Navigation instance
            const navigationInstance = window.navigationInstance;
            if (navigationInstance?.preloadedData) {
                navigationInstance.preloadedData.dms = dms;
                navigationInstance.preloadedData.servers = servers;
                Console.log('Updated Navigation preloaded data');
            }
            
            const currentView = document.querySelector('#selectDM').classList.contains('active') ? 'dms' : 'servers';
            await this.loadChannels(currentView);
            
            Console.success('Successfully refreshed all channels');
        } catch (error) {
            Console.error(`Failed to refresh channels: ${error.message}`);
        } finally {
            buttonElement.classList.remove('spinning');
        }
    }

    // Add new method to restore the view state
    async restoreViewState() {
        // Load the correct view type
        await this.loadChannels(this.lastViewState.type);
        
        // Update active button state
        const dmButton = document.querySelector('#selectDM');
        const serverButton = document.querySelector('#selectServer');
        dmButton.classList.toggle('active', this.lastViewState.type === 'dms');
        serverButton.classList.toggle('active', this.lastViewState.type === 'servers');
        
        // Restore search term if any
        const searchInput = document.querySelector('#channelSearch');
        if (searchInput && this.lastViewState.searchTerm) {
            searchInput.value = this.lastViewState.searchTerm;
            this.filterChannels(this.lastViewState.searchTerm.toLowerCase());
        }
        
        // If we're in server view and have expanded servers, restore them
        if (this.lastViewState.type === 'servers' && this.lastViewState.expandedServers.size > 0) {
            for (const serverId of this.lastViewState.expandedServers) {
                const serverContainer = document.querySelector(`[data-server-id="${serverId}"]`);
                if (serverContainer) {
                    const serverHeader = serverContainer.querySelector('.server-header');
                    const serverName = serverHeader.dataset.serverName;
                    await this.loadServerChannels(serverId, serverName);
                    const expandIcon = serverHeader.querySelector('.server-expand');
                    if (expandIcon) {
                        expandIcon.textContent = '▲';
                    }
                }
            }
        }
        
        // Restore scroll position after a short delay to ensure content is rendered
        const channelList = document.querySelector('#channelList');
        if (channelList) {
            // Use requestAnimationFrame for smoother scrolling
            requestAnimationFrame(() => {
                channelList.scrollTop = this.lastViewState.scrollPosition;
            });
        }
    }
}

module.exports = MediaViewerScreen;
