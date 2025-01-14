const BaseScreen = require('./BaseScreen');
const Console = require('../components/Console');
const DiscordAPI = require('../utils/discord');
const Store = require('electron-store');

class MediaViewerScreen extends BaseScreen {
    constructor(token, userId) {
        super(token);
        this.api = new DiscordAPI(token, userId);
        this.selectedChannel = null;
        this.mediaList = [];
        this.currentIndex = 0;
        this.saveLocation = null;
        this.mediaTypes = {
            images: true,
            videos: true,
            gifs: true
        };
        this.autoplayVideos = true;
        this.store = new Store();
        this.videoVolume = this.loadVolumeSetting();  // Load saved volume
        // Add pagination tracking
        this.currentOffset = 0;
        this.hasMoreMedia = true;
        this.isLoading = false;
        this.totalResults = 0;
        // Add cache for media
        this.mediaCache = new Map();
        this.currentResizeObserver = null;
        // Add tracking for in-progress preloads
        this.preloadingIndexes = new Set();
        // Add initial media storage
        this.initialMediaList = [];
    }

    // Load volume from store
    loadVolumeSetting() {
        return this.store.get('mediaViewer.videoVolume', 0.5);  // Default to 0.5 if not set
    }

    // Save volume to store
    saveVolumeSetting(volume) {
        this.store.set('mediaViewer.videoVolume', volume);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container media-viewer">
                <div class="channel-selection ${this.selectedChannel ? 'hidden' : ''}">
                    <h1>Media Viewer</h1>
                    <div class="source-buttons">
                        <button id="selectDM" class="source-btn">
                            <span>💬</span> Direct Messages
                        </button>
                        <button id="selectServer" class="source-btn">
                            <span>🖥️</span> Servers
                        </button>
                    </div>
                    <div class="search-container">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="channelSearch" placeholder="Search channels..." class="search-input">
                    </div>
                    <div id="channelList" class="channel-list hidden">
                        <!-- Channels will be loaded here -->
                    </div>
                </div>

                <!-- Media Viewer Section -->
                <div class="media-viewer-content ${!this.selectedChannel ? 'hidden' : ''}">
                    <div class="media-controls">
                        <div class="channel-info">
                            <button id="backToChannels" class="back-btn">← Back</button>
                            <span id="channelName"></span>
                        </div>
                        <div class="media-types">
                            <label><input type="checkbox" id="typeImages" checked> Images</label>
                            <label><input type="checkbox" id="typeVideos" checked> Videos</label>
                            <label><input type="checkbox" id="typeGifs" checked> GIFs</label>
                            <label><input type="checkbox" id="autoplayVideos" checked> Autoplay Videos</label>
                            <div class="volume-control">
                                <label>Volume: </label>
                                <input type="range" id="videoVolume" min="0" max="100" value="50">
                                <span id="volumeValue">50%</span>
                            </div>
                        </div>
                        <div class="save-location">
                            <button id="selectSaveLocation">Set Save Location</button>
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
                        <span id="mediaCounter">0/0</span>
                        <span id="mediaDetails"></span>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners(container);

        // Add resize listener for window
        window.addEventListener('resize', () => {
            const currentElement = document.querySelector('#mediaContent img, #mediaContent video');
            if (currentElement && this.mediaList[this.currentIndex]) {
                this.adjustMediaSize(currentElement, this.mediaList[this.currentIndex]);
            }
        });
    }

    setupEventListeners(container) {
        // Source selection buttons
        container.querySelector('#selectDM').addEventListener('click', () => this.loadChannels('dms'));
        container.querySelector('#selectServer').addEventListener('click', () => this.loadChannels('servers'));
        
        // Media type toggles
        Object.keys(this.mediaTypes).forEach(type => {
            const checkbox = container.querySelector(`#type${type.charAt(0).toUpperCase() + type.slice(1)}`);
            checkbox.addEventListener('change', (e) => {
                this.mediaTypes[type] = e.target.checked;
                if (this.selectedChannel) {
                    this.loadMedia();
                }
            });
        });

        // Navigation and other controls...
        container.querySelector('#prevMedia').addEventListener('click', () => this.navigateMedia(-1));
        container.querySelector('#nextMedia').addEventListener('click', () => this.navigateMedia(1));
        container.querySelector('#backToChannels').addEventListener('click', () => this.resetView());

        // Add search functionality
        const searchInput = container.querySelector('#channelSearch');
        searchInput.addEventListener('input', () => {
            this.filterChannels(searchInput.value.toLowerCase());
        });

        // Add autoplay toggle listener
        const autoplayCheckbox = container.querySelector('#autoplayVideos');
        autoplayCheckbox.addEventListener('change', (e) => {
            this.autoplayVideos = e.target.checked;
        });

        // Update volume control listener to persist the setting
        const volumeSlider = container.querySelector('#videoVolume');
        const volumeValue = container.querySelector('#volumeValue');
        
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100;
            this.videoVolume = volume;
            this.saveVolumeSetting(volume);  // Save to store
            volumeValue.textContent = `${Math.round(volume * 100)}%`;
            
            // Update volume of currently playing video if exists
            const currentVideo = document.querySelector('#mediaContent video');
            if (currentVideo) {
                currentVideo.volume = volume;
            }
        });

        // Set initial volume value from stored setting
        volumeSlider.value = this.videoVolume * 100;
        volumeValue.textContent = `${Math.round(this.videoVolume * 100)}%`;

        // Add keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Only handle keyboard events when media viewer is active
            if (!this.selectedChannel) return;

            switch (e.key) {
                case 'ArrowLeft':
                    this.navigateMedia(-1);
                    break;
                case 'ArrowRight':
                    this.navigateMedia(1);
                    break;
            }
        });
    }

    async loadChannels(type) {
        const channelList = document.querySelector('#channelList');
        channelList.innerHTML = '<div class="loading">Loading channels...</div>';
        channelList.classList.remove('hidden');

        try {
            if (type === 'dms') {
                const dms = await this.api.getAllOpenDMs();
                const sortedDMs = dms.sort((a, b) => {
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
                const servers = await this.api.getAllAccessibleServers();
                
                if (!servers || servers.length === 0) {
                    channelList.innerHTML = '<div class="info-message">No accessible servers found.</div>';
                    return;
                }

                // Sort servers by name
                const sortedServers = servers.sort((a, b) => a.name.localeCompare(b.name));
                const serverChannels = sortedServers.map((server, index) => ({
                    id: server.id,
                    name: server.name,
                    type: 'server',
                    index: index + 1,
                    searchText: server.name.toLowerCase()
                }));

                this.renderChannelList(serverChannels);
                Console.success(`Loaded ${servers.length} servers`);
            }
        } catch (error) {
            Console.error('Error loading channels: ' + error.message);
            channelList.innerHTML = '<div class="error-message">Failed to load channels</div>';
        }
    }

    async loadServerChannels(serverId, serverName) {
        const channelList = document.querySelector('#channelList');
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

            // Get server channels
            const channels = await this.api.getGuildChannels(serverId);
            const textChannels = channels
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

    selectChannel(channel) {
        this.selectedChannel = {
            ...channel,
            // Store guild ID when selecting a server channel
            guildId: channel.type === 'server-channel' ? channel.serverId : null
        };
        
        document.querySelector('.channel-selection').classList.add('hidden');
        document.querySelector('.media-viewer-content').classList.remove('hidden');
        document.querySelector('#channelName').textContent = channel.name;
        
        this.loadMedia();
    }

    resetView() {
        // Stop any playing videos
        const currentVideo = document.querySelector('#mediaContent video');
        if (currentVideo) {
            currentVideo.pause();
            currentVideo.src = ''; // Clear the source to fully stop the video
        }

        this.selectedChannel = null;
        this.mediaList = [];
        this.currentIndex = 0;
        document.querySelector('.channel-selection').classList.remove('hidden');
        document.querySelector('.media-viewer-content').classList.add('hidden');
        document.querySelector('#channelList').classList.add('hidden');
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
        const endIndex = Math.min(startIndex + count, this.mediaList.length);
        const preloadPromises = [];

        const newIndexesToPreload = [];
        for (let i = startIndex; i < endIndex; i++) {
            if (!this.preloadingIndexes.has(i) && !this.mediaCache.has(this.mediaList[i].url)) {
                newIndexesToPreload.push(i);
                this.preloadingIndexes.add(i);
            }
        }

        if (newIndexesToPreload.length === 0) {
            return;
        }

        for (const index of newIndexesToPreload) {
            const mediaItem = this.mediaList[index];
            preloadPromises.push(
                this.preloadMedia(mediaItem).finally(() => {
                    this.preloadingIndexes.delete(index);
                })
            );
        }

        if (preloadPromises.length > 0) {
            try {
                await Promise.all(preloadPromises);
            } catch (error) {
                // Silent fail
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
                displayElement.volume = this.videoVolume;  // Set the volume
                if (this.autoplayVideos) {
                    displayElement.autoplay = true;
                }
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
        if (reset) {
            this.currentOffset = 0;
            this.mediaList = [];
            this.currentIndex = 0;
            this.hasMoreMedia = true;
            this.initialMediaList = []; // Reset initial media list
        }

        if (!this.hasMoreMedia || this.isLoading) return;

        try {
            this.isLoading = true;
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
            } else {
                Console.error('Unknown channel type:', this.selectedChannel.type);
                return;
            }

            // Store initial media list if this is the first load
            if (reset && this.initialMediaList.length === 0) {
                this.initialMediaList = [...response.media];
            }

            // Filter media based on current media types while maintaining original order
            if (reset) {
                this.mediaList = this.initialMediaList.filter(item => {
                    if (item.type === 'gif' && this.mediaTypes.gifs) return true;
                    if (item.type === 'video' && this.mediaTypes.videos) return true;
                    if (item.type === 'image' && this.mediaTypes.images) return true;
                    return false;
                });
            } else {
                // For pagination, add new items that aren't in the initial list
                const newMedia = response.media.filter(item => 
                    !this.initialMediaList.some(initial => initial.url === item.url)
                );
                this.initialMediaList.push(...newMedia);
                
                // Update mediaList with filtered items
                this.mediaList = this.initialMediaList.filter(item => {
                    if (item.type === 'gif' && this.mediaTypes.gifs) return true;
                    if (item.type === 'video' && this.mediaTypes.videos) return true;
                    if (item.type === 'image' && this.mediaTypes.images) return true;
                    return false;
                });
            }

            this.hasMoreMedia = response.hasMore;
            this.currentOffset = response.offset;
            this.totalResults = response.total;

            Console.log(`Loaded ${this.mediaList.length}/${this.totalResults} media items...`);

            if (reset) {
                if (this.mediaList.length === 0) {
                    const mediaContent = document.querySelector('#mediaContent');
                    mediaContent.innerHTML = '<div class="no-media">No media found</div>';
                    document.querySelector('#mediaCounter').textContent = '0/0';
                    document.querySelector('#mediaDetails').textContent = '';
                    return;
                }
                await this.displayCurrentMedia();
                Console.success(`Initially loaded ${this.mediaList.length} media items`);
            }

        } catch (error) {
            Console.error('Error loading media:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async navigateMedia(direction) {
        if (!this.mediaList.length) return;

        const newIndex = this.currentIndex + direction;
        
        // Handle wrapping
        if (newIndex < 0) this.currentIndex = this.mediaList.length - 1;
        else if (newIndex >= this.mediaList.length) this.currentIndex = 0;
        else this.currentIndex = newIndex;

        // Display current media
        await this.displayCurrentMedia();

        // Only preload in the direction we're moving
        const preloadStartIndex = direction > 0 ? 
            this.currentIndex + 1 : 
            Math.max(0, this.currentIndex - 5);
            
        this.preloadBatch(preloadStartIndex, 5);

        // Check if we need to load more media from API
        if (direction > 0 && 
            this.currentIndex >= this.mediaList.length - 5 && 
            this.hasMoreMedia && 
            !this.isLoading) {
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
}

module.exports = MediaViewerScreen; 