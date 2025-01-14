const Console = require('../components/Console');

class DiscordAPI {
    constructor(token, userId = null) {
        this.token = token;
        this.baseURL = 'https://discord.com/api/v9';
        this.userId = userId;
    }

    async makeRequest(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                Authorization: `${this.token}`
            }
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            return response;
        } catch (error) {
            console.error(`Request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    async verifyToken(token) {
        try {
            const response = await this.makeRequest('/users/@me');
            if (response.status === 200) {
                const userData = await response.json();
                return {
                    isValid: true,
                    userId: userData.id,
                    userData: userData
                };
            }
            return {
                isValid: false,
                userId: null,
                userData: null
            };
        } catch (error) {
            console.error('Token verification failed:', error);
            return {
                isValid: false,
                userId: null,
                userData: null
            };
        }
    }

    async getAllOpenDMs() {
        try {
            const response = await this.makeRequest('/users/@me/channels');
            if (!response.ok) {
                throw new Error(`Failed to fetch DMs: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Sort DMs by last_message_id (most recent first)
            return data.sort((a, b) => {
                const lastA = a.last_message_id ? BigInt(a.last_message_id) : BigInt(-1);
                const lastB = b.last_message_id ? BigInt(b.last_message_id) : BigInt(-1);
                // Convert the comparison to a regular number (-1, 0, or 1)
                return lastB > lastA ? 1 : lastB < lastA ? -1 : 0;
            });
        } catch (error) {
            console.error('Failed to fetch DMs:', error);
            throw error;
        }
    }

    async deleteMessage(channelId, messageId) {
        try {
            const response = await this.makeRequest(
                `/channels/${channelId}/messages/${messageId}`,
                {
                    method: 'DELETE'
                }
            );

            // Discord returns 204 No Content for successful deletions
            if (response.status === 204) {
                return true;
            }

            const errorText = await response.text();
            console.error(`Failed to delete message ${messageId}: ${response.status} - ${errorText}`);
            return false;
        } catch (error) {
            console.error(`Error deleting message ${messageId}:`, error);
            return false;
        }
    }

    async searchMessages({
        channelOrGuildId,
        offset = 0,
        isGuild = false,
        beforeDate = null,
        afterDate = null,
        content = null,
        authorId = null,
        channelId = null,
        isServerChannel = false
    }) {
        try {
            // If it's a server channel, we need to first get the guild ID
            if (isServerChannel) {
                try {
                    const channelResponse = await this.makeRequest(`/channels/${channelOrGuildId}`);
                    if (!channelResponse.ok) {
                        throw new Error('MISSING_ACCESS');
                    }
                    const channelData = await channelResponse.json();
                    // Update the IDs for the search
                    const guildId = channelData.guild_id;
                    channelId = channelOrGuildId; // Store original channel ID
                    channelOrGuildId = guildId; // Use guild ID for the search
                    isGuild = true; // Switch to guild search mode
                } catch (error) {
                    console.error('Error fetching guild ID:', error);
                    throw error;
                }
            }

            // Rest of the existing searchMessages code remains the same
            const params = new URLSearchParams();
            
            if (authorId) {
                if (Array.isArray(authorId)) {
                    authorId.forEach(id => params.append('author_id', id));
                } else {
                    params.append('author_id', authorId);
                }
            }

            if (offset) params.append('offset', offset);
            if (beforeDate) params.append('max_id', beforeDate);
            if (afterDate) params.append('min_id', afterDate);
            if (content) params.append('content', content);
            
            // Set endpoint and add channel_id for guild searches
            const endpoint = isGuild
                ? `/guilds/${channelOrGuildId}/messages/search`
                : `/channels/${channelOrGuildId}/messages/search`;

            if (isGuild) {
                if (channelId) {
                    params.append('channel_id', channelId);
                }
                params.append('include_nsfw', 'true');
            }

            // Make the request with search parameters
            const response = await this.makeRequest(
                `${endpoint}?${params.toString()}`,
                {
                    method: 'GET'
                }
            );

            if (!response.ok) {
                throw new Error('MISSING_ACCESS');
            }

            const data = await response.json();

            // Flatten and sort messages
            const messages = data.messages
                .flat()
                .sort((a, b) => {
                    // Convert to BigInt and return -1, 0, or 1
                    const idA = BigInt(a.id);
                    const idB = BigInt(b.id);
                    // Convert the comparison to a regular number (-1, 0, or 1)
                    return idB > idA ? 1 : idB < idA ? -1 : 0;
                });

            return {
                messages,
                totalResults: parseInt(data.total_results)
            };

        } catch (error) {
            throw error;
        }
    }

    async cacheAttachment(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error(`Failed to cache attachment: ${error}`);
            return null;
        }
    }

    async deleteChannelMessages({
        channelOrGuildId, 
        channelName, 
        authorId = null, 
        beforeDate = null, 
        afterDate = null, 
        contentSearch = null,
        specificChannelId = null,
        deleteDelay = () => 1000,
        onProgress = null,
        isRunning = () => true,
        isGuild = false,
        isServerChannel = false
    }) {
        console.log(`deleteChannelMessages started for ${isGuild ? 'server' : 'channel'}: ${channelName}`);
        const seen = new Set();
        let page = 1;
        let offset = 0;
        let total = 0;
        let deleteMessagesCount = 0;
        let stuckCount = 0;

        const stopDeletion = () => {
            return {
                success: false,
                deletedCount: deleteMessagesCount,
                total,
                stopped: true
            };
        };

        while (true) {
            if (!isRunning()) return stopDeletion();

            try {
                console.log("Searching messages...");
                const searchResult = await this.searchMessages({
                    channelOrGuildId,
                    offset,
                    isGuild,
                    beforeDate,
                    afterDate,
                    content: contentSearch,
                    authorId: authorId,
                    channelId: specificChannelId,
                    isServerChannel: isServerChannel
                });

                console.log("Search result:", searchResult ? "found messages" : "no messages found");

                if (!searchResult) {
                    if (!isRunning()) return stopDeletion();
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    Console.warn(`No messages found, attempt: ${stuckCount}`);
                    stuckCount++;
                    if (stuckCount > 5) {
                        Console.error(`Seems like we are stuck, exiting deletion for the current ${isGuild ? 'server' : 'DM'}`);
                        break;
                    }
                    continue;
                }

                const { messages, totalResults } = searchResult;
                // Reset stuck count when we find messages
                if (page === 1) {
                    total = totalResults;
                    Console.log(`Found ${total} messages to process`);
                }

                const toDelete = [];
                const lastOffset = offset;

                // Get checkbox state from Console
                const shouldCacheAttachments = document.getElementById('cacheAttachments')?.checked;

                // First, collect all messages and count total attachments
                const messagesToProcess = messages.filter(message => 
                    !seen.has(message.id) && 
                    (message.type === 0 || (message.type >= 6 && message.type <= 21))
                );

                // Add handling for non-deletable messages
                messages.forEach(message => {
                    if (!seen.has(message.id) && !(message.type === 0 || (message.type >= 6 && message.type <= 21))) {
                        Console.log(`Skipping non-deletable message type ${message.type}`);
                        seen.add(message.id);
                        offset++;
                        deleteMessagesCount++; // Increment counter for skipped messages
                        if (onProgress) {
                            onProgress(deleteMessagesCount, total);
                        }
                    }
                });

                // Calculate total attachments to cache
                const totalAttachments = shouldCacheAttachments ? 
                    messagesToProcess.reduce((sum, msg) => sum + (msg.attachments?.length || 0), 0) : 0;

                let cachedCount = 0;
                let progressMessage = null;

                // Process each message
                for (const message of messagesToProcess) {
                    let cachedAttachments = [];
                    
                    // Handle attachments if they exist
                    if (message.attachments && message.attachments.length > 0) {
                        if (shouldCacheAttachments) {
                            if (totalAttachments > 0 && !progressMessage) {
                                Console.log(`Caching ${totalAttachments} total attachments...`);
                                progressMessage = Console.progress(`Caching Progress: [${this.createProgressBar(0)}] 0% (0/${totalAttachments})`);
                            }

                            for (const attachment of message.attachments) {
                                const cachedUrl = await this.cacheAttachment(attachment.url);
                                if (cachedUrl) {
                                    cachedAttachments.push({
                                        ...attachment,
                                        url: cachedUrl
                                    });
                                    cachedCount++;
                                    
                                    // Update progress in-line
                                    const progress = Math.floor((cachedCount / totalAttachments) * 100);
                                    const progressText = `Caching Progress: [${this.createProgressBar(progress)}] ${progress}% (${cachedCount}/${totalAttachments})`;
                                    Console.updateProgress(progressMessage, progressText);
                                }
                            }
                        } else {
                            // If caching is disabled, just store the original attachments
                            cachedAttachments = message.attachments;
                        }
                    }

                    toDelete.push({
                        id: message.id,
                        content: message.content,
                        channelId: message.channel_id,
                        attachments: cachedAttachments
                    });
                }

                // Clear the progress message if it exists
                if (progressMessage) {
                    Console.clearProgress(progressMessage);
                    Console.log('Caching complete!');
                }

                // Update seen messages and offset
                messagesToProcess.forEach(message => {
                    seen.add(message.id);
                });

                if (toDelete.length === 0 && offset === lastOffset) {
                    if (total > 0 && seen.size < total) {
                        Console.warn("No new messages found, waiting for Discord to index");
                        if (!isRunning()) return stopDeletion();
                        await new Promise(resolve => setTimeout(resolve, deleteDelay() * 3 + 10000));
                        stuckCount++;
                        if (stuckCount > 5) {
                            Console.error(`Seems like we are stuck, exiting deletion for the current ${isGuild ? 'server' : 'DM'}`);
                            break;
                        }
                        continue;
                    }
                } else {
                    // Reset stuck count when we find new messages to delete
                    console.log("Resetting stuck count");
                    stuckCount = 0;
                }

                for (const message of toDelete) {
                    if (!isRunning()) return stopDeletion();

                    let retryCount = 0;
                    const maxRetries = 5;
                    let deleted = false;

                    while (retryCount < maxRetries && !deleted && isRunning()) {
                        deleted = await this.deleteMessage(message.channelId, message.id);
                        
                        if (deleted) {
                            deleteMessagesCount++;
                            seen.add(message.id);
                            
                            // Create base message text
                            let messageText = `${channelName}: Deleted message: ${message.content}`;
                            
                            // Add attachments if they exist
                            if (message.attachments && message.attachments.length > 0) {
                                messageText += '\nAttachments:';
                                message.attachments.forEach(attachment => {
                                    messageText += `\n- ${attachment.filename}`;
                                });
                            }
                            console.log('message: ', message)
                            Console.delete(messageText, message.attachments);
                            
                            if (onProgress) {
                                onProgress(deleteMessagesCount, total);
                            }
                        } else {
                            retryCount++;
                            if (retryCount < maxRetries && isRunning()) {
                                const currentDelay = typeof deleteDelay === 'function' ? deleteDelay() : deleteDelay;
                                const delayTime = currentDelay * (Math.pow(2, retryCount)) + 1000;
                                Console.warn(`Retry ${retryCount}/${maxRetries} in ${delayTime/1000}s...`);
                                await new Promise(resolve => setTimeout(resolve, delayTime));
                            } else {
                                Console.warn('Max retries reached. Skipping message.');
                                seen.add(message.id);
                                offset++;
                            }
                        }
                    }

                    if (!isRunning()) return stopDeletion();
                    const currentDelay = typeof deleteDelay === 'function' ? deleteDelay() : deleteDelay;
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                }

                if (seen.size >= total) {
                    Console.success(`Finished processing dm/server: ${channelName}`);
                    return {
                        success: true,
                        deletedCount: deleteMessagesCount,
                        total
                    };
                }

                page++;
                if (!isRunning()) return stopDeletion();
                Console.log(`Searching next page after ${deleteDelay() * 3 + 25000}ms delay`);
                await new Promise(resolve => setTimeout(resolve, deleteDelay() * 3 + 25000));

            } catch (error) {
                console.error("Error in deletion loop:", error);
                
                // Check for Missing Access error
                if (error.message === 'MISSING_ACCESS') {
                    return {
                        success: false,
                        deletedCount: deleteMessagesCount,
                        total,
                        error: 'MISSING_ACCESS',
                        code: 50001  // Discord's error code for Missing Access
                    };
                }

                if (!isRunning()) return stopDeletion();
                await new Promise(resolve => setTimeout(resolve, deleteDelay() * 2));
            }
        }

        return stopDeletion();
    }

    async closeDM(channelId) {
        try {
            const response = await this.makeRequest(
                `/channels/${channelId}`,
                {
                    method: 'DELETE'
                }
            );

            if (response.status === 200) {
                return true;
            }

            throw new Error(`Failed to close DM: ${response.status}`);
        } catch (error) {
            console.error('Error closing DM:', error);
            throw error;
        }
    }

    async getMessageCountForUser(channelId, authorId = null, isGuild = false, specificChannelId = null, isServerChannel = false) {
        console.log("getMessageCountForUser started");
        
        try {
            // If it's a server channel, we need to first get the guild ID
            if (isServerChannel) {
                try {
                    const channelResponse = await this.makeRequest(`/channels/${channelId}`);
                    if (!channelResponse.ok) {
                        throw new Error('MISSING_ACCESS');
                    }
                    const channelData = await channelResponse.json();
                    // Update the IDs for the search
                    const guildId = channelData.guild_id;
                    specificChannelId = channelId; // Store original channel ID
                    channelId = guildId; // Use guild ID for the search
                    isGuild = true; // Switch to guild search mode
                } catch (error) {
                    console.error('Error fetching guild ID:', error);
                    throw error;
                }
            }
    
            const headers = {
                Authorization: this.token
            };
            
            const params = new URLSearchParams();
            if (authorId) {
                params.append('author_id', authorId);
            }
            if (specificChannelId && isGuild) {
                params.append('channel_id', specificChannelId);
            }
            params.append('include_nsfw', 'true');
    
            // Rest of the existing getMessageCount function logic
            async function getMessageCount(url, params, delay = 1000, maxRetries = 5) {
                let retryCount = 0;
                
                while (retryCount < maxRetries) {
                    try {
                        const response = await fetch(`${url}?${params.toString()}`, { headers });
                        
                        if (response.ok) {
                            const data = await response.json();
                            return data.total_results || 0;
                        } else if (response.status === 429) {
                            const retryAfter = parseInt(response.headers.get('Retry-After') || delay/1000) + 1;
                            console.log(`Rate limited. Retrying in ${retryAfter} seconds...`);
                            Console.warn(`Rate limited. Retrying in ${retryAfter} seconds...`);
                            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                            retryCount++;
                            delay *= 2; // Exponential backoff
                        } else {
                            console.error(`Failed to fetch messages: ${response.status} - ${await response.text()}`);
                            return null;
                        }
                    } catch (error) {
                        console.error('Error fetching message count:', error);
                        Console.error('Error fetching message count:', error);
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
                
                console.log('Max retries reached. Returning null.');
                return null;
            }
    
            let url;
            if (isGuild) {
                url = `${this.baseURL}/guilds/${channelId}/messages/search`;
            } else {
                url = `${this.baseURL}/channels/${channelId}/messages/search`;
            }
    
            return await getMessageCount(url, params);
        } catch (error) {
            console.error('Error in getMessageCountForUser:', error);
            return null;
        }
    }

    async getAllAccessibleServers() {
        try {
            const response = await this.makeRequest('/users/@me/guilds');
            if (!response.ok) {
                throw new Error(`Failed to fetch servers: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Sort servers by name
            return data.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            throw error;
        }
    }

    async leaveServer(serverId) {
        try {
            const response = await this.makeRequest(
                `/users/@me/guilds/${serverId}`,
                {
                    method: 'DELETE'
                }
            );

            if (response.status === 204) {
                return true;
            }

            throw new Error(`Failed to leave server: ${response.status}`);
        } catch (error) {
            console.error('Error leaving server:', error);
            throw error;
        }
    }

    async getUserIdFromChannelId(channelId) {
        try {
            const response = await this.makeRequest(`/channels/${channelId}`);
            
            if (response.status === 200) {
                const data = await response.json();
                return data.recipients[0]?.id || null;
            } else {
                console.log('Request failed with status code:', response.status);
                return null;
            }
        } catch (error) {
            console.error('Error getting user ID:', error);
            return null;
        }
    }

    async openDM(channelId) {
        try {
            // First get the recipient ID
            const recipientId = await this.getUserIdFromChannelId(channelId);
            if (!recipientId) {
                console.error('Could not get recipient ID');
                return null;
            }

            // Then open the DM with the recipient ID
            const response = await this.makeRequest(
                '/users/@me/channels',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.token
                    },
                    body: JSON.stringify({
                        recipients: [recipientId]
                    })
                }
            );

            if (response.status === 200) {
                console.log('Request successful');
                return await response.json();
            } else {
                console.log('Request failed with status code:', response.status);
                console.error("Error: ", await response.text());
                return null;
            }
        } catch (error) {
            console.error('Error opening DM:', error);
            throw error;
        }
    }

    async getUserInfo(channelId, isRecipientId = false) {
        try {
            // Only get the recipient ID if we don't already have it
            const recipientId = isRecipientId ? channelId : await this.getUserIdFromChannelId(channelId);
            if (!recipientId) {
                throw new Error('Could not get recipient ID');
            }

            try {
                // First try to get the full profile
                const profileResponse = await this.makeRequest(`/users/${recipientId}/profile`);
                
                if (profileResponse.status === 200) {
                    const userData = await profileResponse.json();
                    return {
                        username: userData.user.username,
                        discriminator: userData.user.discriminator || '0',
                        id: userData.user.id,
                        avatar: userData.user.avatar,
                        banner: userData.user.banner,
                        bio: userData.user_profile?.bio,
                        pronouns: userData.user_profile?.pronouns,
                        accentColor: userData.user.accent_color,
                        flags: userData.user.flags,
                        globalName: userData.user.global_name,
                        avatarDecoration: userData.user.avatar_decoration,
                        connectedAccounts: userData.connected_accounts || [],
                        premiumSince: userData.premium_since,
                        premiumType: userData.premium_type,
                        mutualGuilds: userData.mutual_guilds || [],
                        mutualFriends: userData.mutual_friends || []
                    };
                }
            } catch (profileError) {
                console.warn('Failed to fetch profile, falling back to basic user info:', profileError);
            }

            // If profile fetch fails, fall back to basic user endpoint
            const basicResponse = await this.makeRequest(`/users/${recipientId}`);
            
            if (basicResponse.status === 200) {
                const userData = await basicResponse.json();
                return {
                    username: userData.username,
                    discriminator: userData.discriminator || '0',
                    id: userData.id,
                    avatar: userData.avatar,
                    banner: userData.banner,
                    accentColor: userData.accent_color,
                    flags: userData.flags,
                    globalName: userData.global_name,
                    avatarDecoration: userData.avatar_decoration
                };
            }

            throw new Error(`Failed to fetch user info: ${basicResponse.status}`);
        } catch (error) {
            console.error('Error getting user info:', error);
            throw error;
        }
    }

    async getGuildInfo(guildId) {
        try {
            // First get basic guild info
            const response = await this.makeRequest(`/guilds/${guildId}`);
            
            if (response.status === 200) {
                const guildData = await response.json();
                
                // Get preview data which includes member count
                const previewResponse = await this.makeRequest(`/guilds/${guildId}/preview`);
                const previewData = previewResponse.ok ? await previewResponse.json() : {};
                
                // Convert BigInt to Number before creating Date
                const timestamp = Number((BigInt(guildData.id) >> 22n) + 1420070400000n);
                
                return {
                    // Basic Info
                    id: guildData.id,
                    name: guildData.name,
                    icon: guildData.icon,
                    description: guildData.description,
                    
                    // Owner & Region Info
                    owner_id: guildData.owner_id,
                    region: guildData.region,
                    
                    // Member Counts
                    approximate_member_count: previewData.approximate_member_count || guildData.approximate_member_count,
                    approximate_presence_count: previewData.approximate_presence_count || guildData.approximate_presence_count,
                    max_members: guildData.max_members,
                    max_presences: guildData.max_presences,
                    
                    // Safety & Settings
                    safety_alerts_channel_id: guildData.safety_alerts_channel_id,
                    explicit_content_filter: guildData.explicit_content_filter,
                    mfa_level: guildData.mfa_level,
                    
                    // Other Details
                    features: guildData.features,
                    created_at: new Date(timestamp),
                    roles: guildData.roles,
                    emojis: guildData.emojis,
                    stickers: guildData.stickers,
                    premium_tier: guildData.premium_tier,
                    premium_subscription_count: guildData.premium_subscription_count,
                    preferred_locale: guildData.preferred_locale,
                    nsfw_level: guildData.nsfw_level,
                    verification_level: guildData.verification_level,
                    
                    // Vanity URL if available
                    vanity_url_code: guildData.vanity_url_code,
                    
                    // Discovery Info
                    discovery_splash: guildData.discovery_splash,
                    description_flags: guildData.description_flags
                };
            } else {
                throw new Error(`Failed to fetch guild info: ${response.status}`);
            }
        } catch (error) {
            console.error('Error getting guild info:', error);
            throw error;
        }
    }

    async getChannelInfo(channelId) {
        try {
            const response = await this.makeRequest(`/channels/${channelId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch channel info: ${response.status}`);
            }

            const channelData = await response.json();
            
            // Convert BigInt to Number for creation timestamp
            const timestamp = Number((BigInt(channelData.id) >> 22n) + 1420070400000n);
            
            return {
                // Basic Info
                id: channelData.id,
                type: this.getChannelType(channelData.type),
                name: channelData.name,
                topic: channelData.topic,
                
                // Guild/Server Info
                guild_id: channelData.guild_id,
                position: channelData.position,
                
                // Permission Info
                permission_overwrites: channelData.permission_overwrites,
                
                // Channel Settings
                nsfw: channelData.nsfw,
                rate_limit_per_user: channelData.rate_limit_per_user,
                
                // Parent Category
                parent_id: channelData.parent_id,
                
                // Timestamps
                created_at: new Date(timestamp),
                last_message_id: channelData.last_message_id,
                
                // Thread specific (if applicable)
                thread_metadata: channelData.thread_metadata,
                member_count: channelData.member_count,
                message_count: channelData.message_count,
                
                // Voice specific (if applicable)
                bitrate: channelData.bitrate,
                user_limit: channelData.user_limit,
                rtc_region: channelData.rtc_region
            };
        } catch (error) {
            console.error('Error getting channel info:', error);
            throw error;
        }
    }

    // Helper method to convert channel type numbers to readable strings
    getChannelType(type) {
        const types = {
            0: 'GUILD_TEXT',
            1: 'DM',
            2: 'GUILD_VOICE',
            3: 'GROUP_DM',
            4: 'GUILD_CATEGORY',
            5: 'GUILD_ANNOUNCEMENT',
            10: 'ANNOUNCEMENT_THREAD',
            11: 'PUBLIC_THREAD',
            12: 'PRIVATE_THREAD',
            13: 'GUILD_STAGE_VOICE',
            14: 'GUILD_DIRECTORY',
            15: 'GUILD_FORUM',
            16: 'GUILD_MEDIA'
        };
        return types[type] || 'UNKNOWN';
    }

    // Add this helper method to create the progress bar
    createProgressBar(percentage) {
        const width = 20;
        const filled = Math.floor(width * (percentage / 100));
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    async getChannelMedia(channelId, options = {}) {
        const {
            beforeId = null,
            afterId = null,
            limit = 25,
            mediaTypes = {
                images: true,
                videos: true,
                gifs: true,
                embeds: true
            }
        } = options;

        try {
            const params = new URLSearchParams();
            if (beforeId) params.append('before', beforeId);
            if (afterId) params.append('after', afterId);
            params.append('limit', limit);

            const response = await this.makeRequest(`/channels/${channelId}/messages?${params}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch messages: ${response.status}`);
            }

            const messages = await response.json();
            const mediaItems = [];

            for (const message of messages) {
                // Process attachments
                if (message.attachments) {
                    for (const attachment of message.attachments) {
                        const contentType = attachment.content_type || '';
                        const isGif = contentType === 'image/gif' || 
                                    attachment.filename.toLowerCase().endsWith('.gif');
                        
                        if (mediaTypes.images && contentType.startsWith('image/') && !isGif) {
                            mediaItems.push({
                                type: 'image',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                channelId: message.channel_id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        } else if (mediaTypes.videos && contentType.startsWith('video/')) {
                            mediaItems.push({
                                type: 'video',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                channelId: message.channel_id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        } else if (mediaTypes.gifs && isGif) {
                            mediaItems.push({
                                type: 'gif',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                channelId: message.channel_id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        }
                    }
                }

                // Process embeds if enabled
                if (mediaTypes.embeds && message.embeds) {
                    for (const embed of message.embeds) {
                        if (embed.type === 'image' || embed.type === 'gifv' || 
                            (embed.image && embed.image.url)) {
                            mediaItems.push({
                                type: embed.type === 'gifv' ? 'gif' : 'image',
                                url: embed.image?.url || embed.url,
                                filename: embed.title || 'Embed',
                                messageId: message.id,
                                channelId: message.channel_id,
                                timestamp: message.timestamp,
                                embedData: embed
                            });
                        } else if (embed.type === 'video' || embed.video) {
                            mediaItems.push({
                                type: 'video',
                                url: embed.video?.url || embed.url,
                                filename: embed.title || 'Video Embed',
                                messageId: message.id,
                                channelId: message.channel_id,
                                timestamp: message.timestamp,
                                embedData: embed
                            });
                        }
                    }
                }
            }

            return {
                media: mediaItems,
                hasMore: messages.length === limit,
                lastMessageId: messages[messages.length - 1]?.id
            };
        } catch (error) {
            console.error('Error fetching channel media:', error);
            throw error;
        }
    }

    async getGuildChannels(guildId) {
        try {
            const response = await this.makeRequest(`/guilds/${guildId}/channels`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch guild channels: ${response.status}`);
            }

            const channels = await response.json();
            
            // Filter and sort text channels
            // Channel types: 0 = TEXT, 2 = VOICE, 4 = CATEGORY, 5 = ANNOUNCEMENT
            return channels
                .filter(channel => channel.type === 0 || channel.type === 5) // Only text and announcement channels
                .sort((a, b) => {
                    // First sort by category position
                    const categoryCompare = (a.parent_id || '').localeCompare(b.parent_id || '');
                    if (categoryCompare !== 0) return categoryCompare;
                    
                    // Then by channel position
                    return a.position - b.position;
                })
                .map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    position: channel.position,
                    parent_id: channel.parent_id,
                    nsfw: channel.nsfw
                }));

        } catch (error) {
            console.error('Error fetching guild channels:', error);
            throw error;
        }
    }

    async getGuildMedia(guildId, options = {}) {
        const {
            offset = 0,
            limit = 25,
            channelId = null,
            mediaTypes = {
                images: true,
                videos: true,
                gifs: true
            }
        } = options;

        try {
            const params = new URLSearchParams();
            
            if (channelId) {
                params.append('channel_id', channelId);
            }
            
            params.append('content', '');
            params.append('include_nsfw', 'true');
            params.append('has', 'file');
            
            if (offset > 0) params.append('offset', offset.toString());
            if (limit !== 25) params.append('limit', limit.toString());

            const response = await this.makeRequest(`/guilds/${guildId}/messages/search?${params}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch guild media: ${response.status}`);
            }

            const data = await response.json();
            const mediaItems = [];

            // Process the messages
            for (const message of data.messages.flat()) {
                // Process attachments
                if (message.attachments) {
                    for (const attachment of message.attachments) {
                        const contentType = attachment.content_type || '';
                        const isGif = contentType === 'image/gif' || 
                                    attachment.filename.toLowerCase().endsWith('.gif');
                        
                        if (mediaTypes.images && contentType.startsWith('image/') && !isGif) {
                            mediaItems.push({
                                type: 'image',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                channelId: message.channel_id,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        } else if (mediaTypes.videos && contentType.startsWith('video/')) {
                            mediaItems.push({
                                type: 'video',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                channelId: message.channel_id,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        } else if (mediaTypes.gifs && isGif) {
                            mediaItems.push({
                                type: 'gif',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                channelId: message.channel_id,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        }
                    }
                }
            }

            Console.log(`Found ${mediaItems.length} media items${channelId ? ' in channel' : ''} (offset: ${offset})`);
            return {
                media: mediaItems,
                total: data.total_results,
                hasMore: data.total_results > (offset + limit),
                offset: offset + limit
            };
        } catch (error) {
            Console.error('Error in getGuildMedia:', error);
            throw error;
        }
    }

    async getDMMedia(channelId, options = {}) {
        const {
            offset = 0,
            limit = 25,
            mediaTypes = {
                images: true,
                videos: true,
                gifs: true
            }
        } = options;

        try {
            const params = new URLSearchParams();
            
            // Add media type filters
            if (mediaTypes.videos) params.append('has', 'video');
            if (mediaTypes.images || mediaTypes.gifs) params.append('has', 'image');
            
            // Add offset and limit
            if (offset > 0) params.append('offset', offset.toString());
            if (limit !== 25) params.append('limit', limit.toString());

            const response = await this.makeRequest(`/channels/${channelId}/messages/search?${params}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch DM media: ${response.status}`);
            }

            const data = await response.json();
            const mediaItems = [];

            // Process the messages
            for (const message of data.messages.flat()) {
                // Process attachments
                if (message.attachments) {
                    for (const attachment of message.attachments) {
                        const contentType = attachment.content_type || '';
                        const isGif = contentType === 'image/gif' || 
                                    attachment.filename.toLowerCase().endsWith('.gif');
                        
                        if (mediaTypes.images && contentType.startsWith('image/') && !isGif) {
                            mediaItems.push({
                                type: 'image',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                channelId: message.channel_id,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        } else if (mediaTypes.videos && contentType.startsWith('video/')) {
                            mediaItems.push({
                                type: 'video',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                channelId: message.channel_id,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        } else if (mediaTypes.gifs && isGif) {
                            mediaItems.push({
                                type: 'gif',
                                url: attachment.url,
                                filename: attachment.filename,
                                messageId: message.id,
                                timestamp: message.timestamp,
                                size: attachment.size,
                                channelId: message.channel_id,
                                dimensions: {
                                    width: attachment.width,
                                    height: attachment.height
                                }
                            });
                        }
                    }
                }
            }

            return {
                media: mediaItems,
                total: data.total_results,
                hasMore: data.total_results > (offset + limit),
                offset: offset + limit
            };
        } catch (error) {
            Console.error('Error fetching DM media:', error);
            throw error;
        }
    }

}

module.exports = DiscordAPI; 