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

        // Add new property to track all known content hashes
        this.knownContentHashes = new Map(); // url -> { hash, filename }

        // Add property to track keyboard listener
        this.keyboardListener = null;
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
                                <div class="shortcut-item">
                                    <span class="shortcut-key">F</span>
                                    <span>Toggle Fullscreen</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="media-details">
                    <span id="mediaDetails"></span>
                    <button id="jumpToMessage" class="jump-btn">Jump to Message</button>
                </div>
                <div class="filter-controls">
                    <label><input type="checkbox" id="filterDuplicates" ${this.filterDuplicates ? 'checked' : ''}> Filter Duplicates</label>
                </div>
            </div>
        `;

        this.container.querySelector('.screen-container').appendChild(mediaViewerContent);
        this.setupMediaEventListeners(this.container);

        // Remove any existing keyboard listener before adding a new one
        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener);
        }

        // Create bound listener and store reference
        this.keyboardListener = this.handleKeyPress.bind(this);
        document.addEventListener('keydown', this.keyboardListener);

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
                // If currently loading, prevent change and revert checkbox
                if (this.isLoading) {
                    Console.warn('Please wait for current loading to complete before changing media filters');
                    // Revert checkbox to previous state
                    e.target.checked = this.mediaTypes[type];
                    return;
                }

                // Update the media type state
                this.mediaTypes[type] = e.target.checked;
                
                // Check if at least one filter is enabled
                const hasEnabledFilter = Object.values(this.mediaTypes).some(enabled => enabled);
                if (!hasEnabledFilter) {
                    Console.warn('At least one media type must be selected');
                    // Revert the checkbox state
                    e.target.checked = true;
                    this.mediaTypes[type] = true;
                    return;
                }
                
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
                    try {
                        await this.loadMedia();
                    } catch (error) {
                        Console.error('Error reloading media after filter change:', error);
                        // Revert the checkbox state if loading fails
                        this.mediaTypes[type] = !e.target.checked;
                        e.target.checked = !e.target.checked;
                    }
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

        // Update duplicate filter toggle listener
        const filterDuplicatesCheckbox = container.querySelector('#filterDuplicates');
        filterDuplicatesCheckbox.addEventListener('change', (e) => {
            // Debounce the change event
            if (this.filterChangeTimeout) {
                clearTimeout(this.filterChangeTimeout);
            }
            
            this.filterChangeTimeout = setTimeout(() => {
                this.saveFilterDuplicatesState(e.target.checked);
            }, 100); // Small delay to prevent multiple rapid toggles
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
            } else {
                // Find the server in cached data
                server = this.cachedServers.find(s => s.id === serverId);
                
                // If server doesn't have channels, fetch them
                if (!server?.channels) {
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

        // Start with the All DMs option if we're rendering DM channels
        const isDMList = channels.length > 0 && channels[0].type === 'dm';
        let html = '';
        
        if (isDMList) {
            html += `
                <div class="channel-item all-dms" 
                    data-channel-type="all-dms"
                    data-channel-name="All Direct Messages">
                    <span class="channel-icon">📑</span>
                    <span class="channel-name">All Direct Messages</span>
                </div>
                <div class="channels-divider">Individual DMs</div>
            `;
        }

        html += channels.map(channel => {
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

        channelList.innerHTML = html;

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
            } else if (item.dataset.channelType === 'all-dms') {
                item.addEventListener('click', () => {
                    this.selectChannel({
                        type: 'all-dms',
                        name: 'All Direct Messages'
                    });
                });
            }
        });
    }

    resetView() {
        // Add this at the start of resetView to prevent further loading
        if (this.isLoading) {
            Console.warn('Please wait for content to finish loading before going back');
            console.log('Back button clicked while loading');
            return;
        }

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
        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener);
            this.keyboardListener = null;
        }

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
        this.mediaCache.clear();
        this.mediaHashes.clear();
        this.preloadingIndexes.clear();
        this.savedFiles = [];
        this.initialMediaList = [];
        this.knownContentHashes.clear();
        
        // Clear any existing autoplay timer
        this.clearAutoplayTimer();

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
   if (this.keyboardListener) {
        document.removeEventListener('keydown', this.keyboardListener);
        this.keyboardListener = null;
    }

    // Clear resize observer
    if (this.currentResizeObserver) {
        this.currentResizeObserver.disconnect();
        this.currentResizeObserver = null;
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

    async displayCurrentMedia() {
        if (!this.mediaList.length) return;

        // Clear any existing autoplay timer when displaying new media
        this.clearAutoplayTimer();

        const mediaContent = document.querySelector('#mediaContent');
        const currentMedia = this.mediaList[this.currentIndex];
        const counter = document.querySelector('#mediaCounter');
        const details = document.querySelector('#mediaDetails');
        const jumpButton = document.querySelector('#jumpToMessage');

        if (!currentMedia?.url) {
            Console.error('Invalid media item at index', this.currentIndex);
            mediaContent.innerHTML = '<div class="error">Invalid media</div>';
            return;
        }

        counter.textContent = `${this.currentIndex + 1}/${this.mediaList.length}`;

        const date = new Date(currentMedia.timestamp).toLocaleString();
        const size = currentMedia.size ? `${(currentMedia.size / 1024 / 1024).toFixed(2)}MB` : '';
        
        // Create clickable media details with all information included
        if (currentMedia.messageId && currentMedia.channelId) {
            details.innerHTML = `<span class="media-filename-link">
                ${currentMedia.filename} ${size ? `(${size})` : ''} - ${date}
            </span>`;
            
            // Add click handler directly to the element
            const linkElement = details.querySelector('.media-filename-link');
            if (linkElement) {
                linkElement.addEventListener('click', () => {
                    this.handleMessageJump(currentMedia.channelId, currentMedia.messageId);
                });
            }
        } else {
            details.textContent = `${currentMedia.filename} ${size ? `(${size})` : ''} - ${date}`;
        }

        // Hide the separate jump button since we now have the clickable details
        if (jumpButton) {
            jumpButton.style.display = 'none';
        }

        try {
            // Clear existing content and any previous observers
            if (this.currentResizeObserver) {
                this.currentResizeObserver.disconnect();
            }
            mediaContent.innerHTML = '';

            // Get cached element
            const element = this.mediaCache.get(currentMedia.url);
            
            if (!element) {
                mediaContent.innerHTML = '<div class="error">Failed to load media</div>';
                return;
            }
            
            // Clone the cached element to prevent issues with multiple displays
            const displayElement = element.cloneNode(true);
            
            if (currentMedia.type === 'video') {
                displayElement.controls = true;
                displayElement.volume = this.videoVolume;
                displayElement.autoplay = this.autoplayVideos;
                displayElement.addEventListener('ended', () => {
                    if (this.autoplayVideos) {
                        this.navigateMedia(1);
                    }
                });
            } else if (this.autoplayVideos) {
                // Only start timer for non-video media after a short delay
                // This prevents race conditions during navigation
                setTimeout(() => {
                    if (this.currentIndex === this.mediaList.indexOf(currentMedia)) {
                        this.startAutoplayTimer();
                    }
                }, 100);
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
                if (displayElement.readyState >= 2) {
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
        console.log("loadMediacalled", reset);
        if (!this.selectedChannel) {
            Console.log('No channel selected, stopping media load');
            return;
        }

        if (!reset && !this.hasMoreMedia) {
            Console.log('Already reached end of media, stopping load');
            return;
        }

        // Create a progress entry for every load
        let progressEntry = Console.progress('Loading media...');

        try {
            this.isLoading = true;
            
            let foundMatchingMedia = false;
            let attempts = 0;
            const MAX_ATTEMPTS = 100;
            const MIN_INITIAL_ITEMS = 10;
            
            // Track total processed items for progress
            let totalProcessed = 0;
            let batchSize = 0;

            while ((!foundMatchingMedia || (reset && this.mediaList.length < MIN_INITIAL_ITEMS)) 
                   && this.hasMoreMedia 
                   && attempts < MAX_ATTEMPTS) {
                
                // Add delay between concurrent attempts
                if (attempts > 0) {
                    const now = Date.now();
                    const timeSinceLastFetch = now - this.lastFetchTime;
                    if (timeSinceLastFetch < this.FETCH_COOLDOWN) {
                        await new Promise(resolve => setTimeout(resolve, this.FETCH_COOLDOWN - timeSinceLastFetch));
                    }
                }
                
                this.lastFetchTime = Date.now();
                
                let response;
                if (this.selectedChannel.type === 'all-dms') {
                    // Special handling for all-dms using cursor
                    response = await this.api.getAllDMsMedia({
                        cursor: this.currentOffset ? {
                            timestamp: this.currentOffset,
                            type: "timestamp"
                        } : null,
                        mediaTypes: this.mediaTypes,
                        limit: 25
                    });
                    
                    this.hasMoreMedia = response.hasMore;
                    // Only update cursor if we got items, otherwise we're at the end
                    this.currentOffset = response.cursor?.timestamp || null;

                } else if (this.selectedChannel.type === 'server-all') {
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

                // Update offset and hasMore for non-all-dms cases
                if (this.selectedChannel.type !== 'all-dms') {
                    this.hasMoreMedia = response.hasMore;
                    this.currentOffset = response.offset;
                }

                if (!response.media?.length) {
                    attempts++;
                    // Only continue if we still have more media
                    if (this.hasMoreMedia) {
                        continue;
                    } else {
                        break;
                    }
                }

                // Step 1: Filter URL duplicates
                const urlFilteredMedia = response.media.filter(item => {
                    const isDuplicate = this.mediaList.some(existing => existing.url === item.url);
                    if (isDuplicate) Console.warn(`Found URL duplicate: ${item.filename}`);
                    return !isDuplicate;
                });

                if (urlFilteredMedia.length > 0) {
                    batchSize = urlFilteredMedia.length;
                    Console.updateProgress(progressEntry, 
                        `Processing new batch of media... (0/${batchSize} items)`);

                    // Step 2: Cache all items and generate hashes if needed
                    for (const item of urlFilteredMedia) {
                        try {
                            totalProcessed++;
                            
                            Console.updateProgress(progressEntry, 
                                `Processing new batch of media... (${totalProcessed}/${batchSize} items)`);

                            if (this.mediaCache.has(item.url)) {
                                continue;
                            }

                            const response = await fetch(item.url, {
                                referrer: "https://discord.com",
                                referrerPolicy: "no-referrer-when-downgrade",
                            });
                            
                            if (!response.ok) {
                                Console.error(`Failed to fetch ${item.filename}`);
                                continue;
                            }

                            const blob = await response.blob();
                            const objectUrl = URL.createObjectURL(blob);

                            // Generate hash if duplicate filtering is enabled
                            if (this.filterDuplicates) {
                                try {
                                    const arrayBuffer = await blob.arrayBuffer();
                                    const data = new Uint8Array(arrayBuffer);
                                    const hashValue = crc32(data).toString(16).padStart(8, '0');
                                    
                                    this.mediaHashes.set(item.url, hashValue);
                                    this.knownContentHashes.set(item.url, {
                                        hash: hashValue,
                                        filename: item.filename
                                    });
                                } catch (error) {
                                    Console.warn(`Failed to generate hash for ${item.filename}: ${error.message}`);
                                    this.mediaHashes.set(item.url, null);
                                    this.knownContentHashes.set(item.url, {
                                        hash: null,
                                        filename: item.filename
                                    });
                                }
                            }

                            // Cache the media
                            if (item.type === 'video') {
                                const video = document.createElement('video');
                                await new Promise((resolve) => {
                                    video.onloadeddata = () => resolve();
                                    video.onerror = () => resolve();
                                    video.src = objectUrl;
                                    video.preload = 'auto';
                                });
                                this.mediaCache.set(item.url, video);
                            } else {
                                const img = new Image();
                                await new Promise((resolve) => {
                                    img.onload = () => resolve();
                                    img.onerror = () => resolve();
                                    img.src = objectUrl;
                                });
                                this.mediaCache.set(item.url, img);
                            }
                            
                        } catch (error) {
                            Console.error(`Error processing ${item.filename}: ${error.message}`);
                            this.mediaCache.set(item.url, null);
                            if (this.filterDuplicates) {
                                this.mediaHashes.set(item.url, null);
                                this.knownContentHashes.delete(item.url);
                            }
                        }
                    }

                    let newMedia;
                    
                    // Step 3: Filter content duplicates if enabled
                    if (this.filterDuplicates) {
                        const newUniqueMedia = [];
                        const seenHashes = new Set();

                        // Add existing hashes to set
                        for (const existingItem of this.mediaList) {
                            const knownContent = this.knownContentHashes.get(existingItem.url);
                            if (knownContent?.hash) {
                                seenHashes.add(knownContent.hash);
                            }
                        }

                        // Process new items
                        for (const item of urlFilteredMedia) {
                            const knownContent = this.knownContentHashes.get(item.url);
                            if (!knownContent?.hash) {
                                newUniqueMedia.push(item); // Include items without hashes
                                continue;
                            }

                            if (!seenHashes.has(knownContent.hash)) {
                                newUniqueMedia.push(item);
                                seenHashes.add(knownContent.hash);
                            } else {
                                Console.warn(`Found duplicate: ${item.filename}`);
                                const matchingItem = Array.from(this.knownContentHashes.values())
                                    .find(content => content.hash === knownContent.hash && content.filename !== item.filename);
                                if (matchingItem) {
                                    Console.warn(`Found duplicate content: ${item.filename} matches ${matchingItem.filename}`);
                                }
                            }
                        }
                        
                        newMedia = newUniqueMedia;
                    } else {
                        newMedia = urlFilteredMedia;
                    }

                    if (newMedia.length > 0) {
                        const currentPosition = this.currentIndex;
                        this.mediaList.push(...newMedia);
                        foundMatchingMedia = true;
                        
                        if (reset) {
                            // Only reset to 0 if this is the first load
                            if (this.mediaList.length === newMedia.length) {
                                this.currentIndex = 0;
                                await this.displayCurrentMedia();
                            }
                        } else {
                            this.updateMediaCounter();
                        }
                    }
                }

                attempts++;
            }

            // Add logging to help debug the exit condition
            if (attempts >= MAX_ATTEMPTS) {
                Console.warn(`Reached maximum fetch attempts (${MAX_ATTEMPTS})`);
            } else if (!this.hasMoreMedia) {
                Console.log('No more media available from API');
            } else if (!foundMatchingMedia) {
                Console.log('No matching media found after processing');
            }

            if (reset && this.mediaList.length > 0) {
                Console.success(`Initially loaded ${this.mediaList.length} media items`);
            }

        } catch (error) {
            Console.error('Error loading media:', error);
        } finally {
            this.isLoading = false;
            // Clear the progress entry when done
            if (progressEntry) {
                Console.clearProgress(progressEntry);
            }
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

    async navigateMedia(direction) {
        // Clear autoplay timer at the start of navigation
        this.clearAutoplayTimer();
        
        if (!this.mediaList.length) return;

        const newIndex = this.currentIndex + direction;
        
        // Don't allow navigation past the end while loading more
        if (newIndex >= this.mediaList.length && this.isLoading) {
            Console.log('Loading in progress, waiting before navigating past end');
            return;
        }

        // Don't allow navigation past the beginning
        if (newIndex < 0) {
            Console.log('Already at start of media');
            return;
        }
        // For forward navigation, only proceed if we have the item
        else if (newIndex < this.mediaList.length) {
            this.currentIndex = newIndex;
            
        // Try to load more if we're at the end and API indicates more available
        } else {
            Console.log('Reached end of all available media');
            return;
        }

        // Display current media
        await this.displayCurrentMedia();

        // If we're getting close to the end, load more media
        if (this.mediaList.length - this.currentIndex <= 25 && this.hasMoreMedia && !this.isLoading) {
            await this.loadMedia(false);
        }
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
            case 'f':
                this.toggleFullscreen();
                break;
            case 'escape':
                if (this.isFullscreen()) {
                    this.exitFullscreen();
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
                // Double check we're still on the same media before navigating
                if (this.currentIndex === this.mediaList.indexOf(currentMedia)) {
                    this.navigateMedia(1);
                }
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
        
        // Remove keyboard listener
        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener);
            this.keyboardListener = null;
        }

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
        
        // Clear known content hashes
        this.knownContentHashes.clear();
        Console.log('Cleared known content hashes');
        
        // Exit fullscreen if active
        if (this.isFullscreen()) {
            this.exitFullscreen();
        }
        
        Console.success('MediaViewer cleanup completed');
    }

    // Add new method to save filter state
    saveFilterDuplicatesState(state) {
        // If already in the same state, do nothing
        if (this.filterDuplicates === state) {
            return;
        }

        // If currently loading, warn user and revert checkbox
        if (this.isLoading) {
            Console.warn('Please wait for current loading to complete before changing filter settings');
            // Revert checkbox to previous state
            const checkbox = document.querySelector('#filterDuplicates');
            if (checkbox) {
                checkbox.checked = this.filterDuplicates;
            }
            return;
        }

        this.filterDuplicates = state;
        this.store.set('filterDuplicates', state);

        // Reset all media-related state
        this.mediaList = [];
        this.currentIndex = 0;
        this.currentOffset = 0;
        this.hasMoreMedia = true;
        this.mediaCache.clear();
        this.mediaHashes.clear();
        this.preloadingIndexes.clear();
        this.knownContentHashes.clear();

        // Clear the media display
        const mediaContent = document.querySelector('#mediaContent');
        if (mediaContent) {
            mediaContent.innerHTML = '<div class="loading">Loading media...</div>';
        }

        // Reset counter and details
        const counter = document.querySelector('#mediaCounter');
        const details = document.querySelector('#mediaDetails');
        if (counter) counter.textContent = '0/0';
        if (details) details.textContent = '';

        // Reload media with new filter state
        if (this.selectedChannel) {
            this.loadMedia(true).catch(error => {
                Console.error('Error reloading media after filter change:', error);
                // If load fails, revert to previous state
                this.filterDuplicates = !state;
                const checkbox = document.querySelector('#filterDuplicates');
                if (checkbox) {
                    checkbox.checked = !state;
                }
            });
        }
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

    // Add new helper method to find matching file
    findMatchingFile(duplicate, hashMap) {
        const duplicateHash = hashMap.get(duplicate.url);
        if (!duplicateHash) return 'Unknown';
        
        for (const [url, hash] of hashMap.entries()) {
            if (hash === duplicateHash && url !== duplicate.url) {
                // Extract filename from URL
                const filename = url.split('/').pop().split('?')[0];
                return filename;
            }
        }
        return 'Unknown';
    }

    // Add the handleMessageJump method
    async handleMessageJump(channelId, messageId) {
        // Check if this is a DM channel (either direct or from all-dms) and if it's not open
        if ((this.selectedChannel.type === 'dm' || this.selectedChannel.type === 'all-dms') && 
            !this.cachedDMs?.some(dm => dm.id === channelId)) {
            Console.log('DM channel not open, attempting to open...');
            try {
                const result = await this.api.openDM(channelId);
                
                if (result && result.recipients && result.recipients[0]) {
                    const username = result.recipients[0].username;
                    Console.success(`Successfully opened DM with ${username}`);
                } else {
                    Console.error('Failed to open DM channel');
                    return;
                }
            } catch (error) {
                Console.error('Error opening DM channel:', error);
                return;
            }
        }

        // Jump to the message
        const { shell } = require('@electron/remote');
        shell.openExternal(`discord://discord.com/channels/@me/${channelId}/${messageId}`);
    }

    isFullscreen() {
        const mediaViewerContent = this.container.querySelector('.media-viewer-content');
        return mediaViewerContent?.classList.contains('fullscreen');
    }

    toggleFullscreen() {
        if (this.isFullscreen()) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }

    enterFullscreen() {
        const mediaViewerContent = this.container.querySelector('.media-viewer-content');
        if (!mediaViewerContent) return;
        
        mediaViewerContent.classList.add('fullscreen');
        
        // Force resize handling for current media
        const currentElement = document.querySelector('#mediaContent img, #mediaContent video');
        if (currentElement && this.mediaList[this.currentIndex]) {
            this.adjustMediaSize(currentElement, this.mediaList[this.currentIndex]);
        }
    }

    exitFullscreen() {
        const mediaViewerContent = this.container.querySelector('.media-viewer-content');
        if (!mediaViewerContent) return;
        
        mediaViewerContent.classList.remove('fullscreen');
        
        // Force resize handling for current media
        const currentElement = document.querySelector('#mediaContent img, #mediaContent video');
        if (currentElement && this.mediaList[this.currentIndex]) {
            this.adjustMediaSize(currentElement, this.mediaList[this.currentIndex]);
        }
    }
}

// Add CRC32 implementation at the class level
function crc32(data) {
    const table = new Int32Array(256);
    let crc = -1;
    
    // Generate CRC table
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    
    // Calculate CRC
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }
    
    return (-1 ^ crc) >>> 0;
}

module.exports = MediaViewerScreen;
