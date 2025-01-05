const { clipboard, ipcRenderer } = require('electron');

class Console {
    static init() {
        const consoleContent = document.getElementById('console-content');
        if (!consoleContent) return;

        consoleContent.innerHTML = `
            <h2>Console</h2>
            <div class="console-section"
                <div class="console-output" id="consoleOutput">
                    <!-- Console messages will appear here -->
                </div>
            </div>
        `;
    }

    static show() {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) {
            consoleContent.style.display = 'flex';
        }
    }

    static hide() {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) {
            consoleContent.style.display = 'none';
        }
    }

    static scrollToBottom(consoleOutput) {
        // Wait for images to load and content to render
        setTimeout(() => {
            requestAnimationFrame(() => {
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            });
        }, 250); // Small delay to ensure everything is rendered
    }

    static log(message, type = 'info') {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;

        const logEntry = document.createElement('div');
        logEntry.className = `console-entry ${type}`;
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logEntry.style.whiteSpace = 'pre-wrap';
        logEntry.style.wordBreak = 'break-word';
        consoleOutput.appendChild(logEntry);
        
        this.scrollToBottom(consoleOutput);
    }

    static clear() {
        const consoleOutput = document.getElementById('consoleOutput');
        if (consoleOutput) {
            consoleOutput.innerHTML = '';
        }
    }

    static success(message) {
        this.log(message, 'success');
    }

    static error(message) {
        this.log(message, 'error');
    }

    static warn(message) {
        this.log(message, 'warning');
    }

    static delete(message) {
        this.log(message, 'delete');
    }

    static printUserInfo(userInfo) {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;

        const infoBlock = document.createElement('div');
        infoBlock.className = 'console-entry info user-info';
        infoBlock.style.whiteSpace = 'pre-wrap';
        infoBlock.style.wordBreak = 'break-word';
        
        const formatLine = (label, value) => `${label}: ${value}<br>`;
        const formatLink = (url) => `
            <div class="console-image-container">
                <img src="${url}" alt="Discord Asset" class="console-image">
            </div>`;
        
        const avatarUrl = userInfo.avatar ? 
            `https://cdn.discordapp.com/avatars/${userInfo.id}/${userInfo.avatar}` : null;
        const bannerUrl = userInfo.banner ? 
            `https://cdn.discordapp.com/banners/${userInfo.id}/${userInfo.banner}` : null;
        
        const getFlagNames = (flags) => {
            if (!flags) return null;
            
            const DISCORD_FLAGS = {
                STAFF: 1 << 0,
                PARTNER: 1 << 1,
                HYPESQUAD: 1 << 2,
                BUG_HUNTER_LEVEL_1: 1 << 3,
                HYPESQUAD_ONLINE_HOUSE_1: 1 << 6,
                HYPESQUAD_ONLINE_HOUSE_2: 1 << 7,
                HYPESQUAD_ONLINE_HOUSE_3: 1 << 8,
                PREMIUM_EARLY_SUPPORTER: 1 << 9,
                TEAM_PSEUDO_USER: 1 << 10,
                BUG_HUNTER_LEVEL_2: 1 << 14,
                VERIFIED_BOT: 1 << 16,
                VERIFIED_DEVELOPER: 1 << 17,
                CERTIFIED_MODERATOR: 1 << 18,
                BOT_HTTP_INTERACTIONS: 1 << 19,
                ACTIVE_DEVELOPER: 1 << 22
            };

            const FLAG_NAMES = {
                STAFF: 'Discord Employee',
                PARTNER: 'Discord Partner',
                HYPESQUAD: 'HypeSquad Events',
                BUG_HUNTER_LEVEL_1: 'Bug Hunter Level 1',
                HYPESQUAD_ONLINE_HOUSE_1: 'HypeSquad Bravery',
                HYPESQUAD_ONLINE_HOUSE_2: 'HypeSquad Brilliance',
                HYPESQUAD_ONLINE_HOUSE_3: 'HypeSquad Balance',
                PREMIUM_EARLY_SUPPORTER: 'Early Supporter',
                TEAM_PSEUDO_USER: 'Team User',
                BUG_HUNTER_LEVEL_2: 'Bug Hunter Level 2',
                VERIFIED_BOT: 'Verified Bot',
                VERIFIED_DEVELOPER: 'Early Verified Bot Developer',
                CERTIFIED_MODERATOR: 'Discord Certified Moderator',
                BOT_HTTP_INTERACTIONS: 'Bot (HTTP Interactions)',
                ACTIVE_DEVELOPER: 'Active Developer'
            };

            const flagNames = Object.entries(DISCORD_FLAGS)
                .filter(([_, value]) => (flags & value) === value)
                .map(([key, _]) => FLAG_NAMES[key])
                .join(', ');
            
            return flagNames || null;
        };

        const lines = ['━━━ User Information ━━━<br>'];

        // Basic Info
        if (userInfo.globalName || userInfo.username) lines.push(formatLine('Username', userInfo.globalName || userInfo.username));
        if (userInfo.username) lines.push(formatLine('Tag', `${userInfo.username}${userInfo.discriminator !== '0' ? `#${userInfo.discriminator}` : ''}`));
        if (userInfo.id) lines.push(formatLine('User ID', userInfo.id));
        if (userInfo.bio) lines.push(formatLine('Bio', userInfo.bio));
        if (userInfo.pronouns) lines.push(formatLine('Pronouns', userInfo.pronouns));
        if (avatarUrl) lines.push(formatLine('Avatar', formatLink(avatarUrl)));
        if (bannerUrl) lines.push(formatLine('Banner', formatLink(bannerUrl)));
        if (userInfo.accentColor) lines.push(formatLine('Accent Color', userInfo.accentColor));
        
        const badges = getFlagNames(userInfo.flags);
        if (badges) lines.push(formatLine('Badges', badges));
        
        if (userInfo.avatarDecoration) lines.push(formatLine('Avatar Decoration', userInfo.avatarDecoration));
        if (userInfo.premiumSince) lines.push(formatLine('Premium Since', userInfo.premiumSince));
        if (userInfo.premiumType) lines.push(formatLine('Premium Type', userInfo.premiumType));

        // Connected Accounts
        if (userInfo.connectedAccounts?.length > 0) {
            lines.push('<br>━━━ Connected Accounts ━━━<br>');
            userInfo.connectedAccounts.forEach(account => {
                lines.push(formatLine(account.type, `${account.name} (ID: ${account.id})`));
            });
        }

        // Mutual Friends
        if (userInfo.mutualFriends?.length > 0) {
            lines.push('<br>━━━ Mutual Friends ━━━<br>');
            userInfo.mutualFriends.forEach(friend => {
                lines.push(formatLine('Friend', `${friend.username}${friend.discriminator !== '0' ? `#${friend.discriminator}` : ''} (ID: ${friend.id})`));
            });
        }

        // Mutual Servers
        if (userInfo.mutualGuilds?.length > 0) {
            lines.push('<br>━━━ Mutual Servers ━━━<br>');
            userInfo.mutualGuilds.forEach(guild => {
                lines.push(formatLine('Server', `${guild.name || 'Unknown'} (ID: ${guild.id})`));
            });
        }

        lines.push('━━━━━━━━━━━━━━━━━');

        infoBlock.innerHTML = lines.join('');
        consoleOutput.appendChild(infoBlock);
        this.scrollToBottom(consoleOutput);
    }

    static printServerInfo(serverInfo) {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;

        const infoBlock = document.createElement('div');
        infoBlock.className = 'console-entry info user-info';
        infoBlock.style.wordBreak = 'break-word';
        
        const formatLine = (label, value) => value ? `${label}: ${value}<br>` : '';
        const formatLink = (url) => `
            <div class="console-image-container">
                <img src="${url}" alt="Discord Asset" class="console-image">
            </div>`;
        
        const createSection = (title, content, isExpandable = false) => {
            if (content.length === 0) return '';
            
            if (!isExpandable) {
                return `<br>━━━ ${title} ━━━<br>${content.join('')}`;
            }
            
            return `
                <br><div class="expandable-section collapsed">
                    <div class="section-header">━━━ ${title} (${content.length} items) ━━━</div>
                    <div class="section-content">
                        ${content.join('')}
                    </div>
                </div>
            `;
        };
        
        const iconUrl = serverInfo.icon ? 
            `https://cdn.discordapp.com/icons/${serverInfo.id}/${serverInfo.icon}` : null;

        const lines = ['━━━ Server Information ━━━<br>'];

        // Basic Info
        const basicInfo = [];
        if (serverInfo.name) basicInfo.push(formatLine('Name', serverInfo.name));
        if (serverInfo.id) basicInfo.push(formatLine('Server ID', serverInfo.id));
        if (serverInfo.description) basicInfo.push(formatLine('Description', serverInfo.description));
        if (iconUrl) basicInfo.push(formatLine('Icon', formatLink(iconUrl)));
        if (serverInfo.created_at) basicInfo.push(formatLine('Created At', serverInfo.created_at.toLocaleString()));
        if (serverInfo.owner_id) basicInfo.push(formatLine('Owner ID', serverInfo.owner_id));
        if (serverInfo.region) basicInfo.push(formatLine('Region', serverInfo.region));
        lines.push(...basicInfo);
        
        // Member Counts
        const memberInfo = [];
        if (serverInfo.approximate_member_count) memberInfo.push(formatLine('Total Members', serverInfo.approximate_member_count));
        if (serverInfo.approximate_presence_count) memberInfo.push(formatLine('Online Members', serverInfo.approximate_presence_count));
        if (serverInfo.max_members) memberInfo.push(formatLine('Max Members', serverInfo.max_members));
        if (serverInfo.max_presences) memberInfo.push(formatLine('Max Presences', serverInfo.max_presences));
        lines.push(createSection('Member Information', memberInfo));
        
        // Safety & Security
        const safetyInfo = [];
        if (serverInfo.verification_level) safetyInfo.push(formatLine('Verification Level', serverInfo.verification_level));
        if (serverInfo.mfa_level) safetyInfo.push(formatLine('2FA Requirement', serverInfo.mfa_level === 1 ? 'Enabled' : 'Disabled'));
        if (serverInfo.explicit_content_filter) safetyInfo.push(formatLine('Content Filter', serverInfo.explicit_content_filter));
        if (serverInfo.nsfw_level) safetyInfo.push(formatLine('NSFW Level', serverInfo.nsfw_level));
        lines.push(createSection('Safety & Security', safetyInfo));
        
        // Server Details
        const serverDetails = [];
        if (serverInfo.premium_tier) serverDetails.push(formatLine('Boost Level', serverInfo.premium_tier));
        if (serverInfo.premium_subscription_count) serverDetails.push(formatLine('Boost Count', serverInfo.premium_subscription_count));
        if (serverInfo.preferred_locale) serverDetails.push(formatLine('Primary Language', serverInfo.preferred_locale));
        if (serverInfo.vanity_url_code) serverDetails.push(formatLine('Vanity URL', `discord.gg/${serverInfo.vanity_url_code}`));
        lines.push(createSection('Server Details', serverDetails));

        // Features
        const features = [];
        if (serverInfo.features?.length > 0) {
            features.push(formatLine('Features', serverInfo.features.join(', ')));
        }
        lines.push(createSection('Server Features', features));

        // Roles (make expandable if more than 5 roles)
        const roles = [];
        if (serverInfo.roles?.length > 0) {
            serverInfo.roles.forEach(role => {
                roles.push(formatLine('Role', `${role.name} (${role.id})`));
            });
        }
        lines.push(createSection('Roles', roles, roles.length > 5));

        lines.push('━━━━━━━━━━━━━━━━━');

        infoBlock.innerHTML = lines.join('');
        
        // Add click handlers for expandable sections
        infoBlock.querySelectorAll('.expandable-section').forEach(section => {
            section.addEventListener('click', () => {
                section.classList.toggle('collapsed');
            });
        });

        consoleOutput.appendChild(infoBlock);
        this.scrollToBottom(consoleOutput);
    }

    static printChannelInfo(channelInfo) {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;

        const infoBlock = document.createElement('div');
        infoBlock.className = 'console-entry info user-info';
        infoBlock.style.whiteSpace = 'pre-wrap';
        infoBlock.style.wordBreak = 'break-word';

        const formatLine = (label, value) => value ? `${label}: ${value}<br>` : '';
        
        const lines = ['━━━ Channel Information ━━━<br>'];

        // Basic Info
        const basicInfo = [];
        basicInfo.push(formatLine('Name', channelInfo.name));
        basicInfo.push(formatLine('Channel ID', channelInfo.id));
        basicInfo.push(formatLine('Type', channelInfo.type));
        basicInfo.push(formatLine('Created At', channelInfo.created_at.toLocaleString()));
        if (channelInfo.topic) basicInfo.push(formatLine('Topic', channelInfo.topic));
        if (channelInfo.position) basicInfo.push(formatLine('Position', channelInfo.position));
        lines.push(...basicInfo);

        // Server Info
        if (channelInfo.guild_id) {
            const serverInfo = [];
            serverInfo.push(formatLine('Server ID', channelInfo.guild_id));
            if (channelInfo.parent_id) serverInfo.push(formatLine('Category ID', channelInfo.parent_id));
            lines.push('<br>━━━ Server Details ━━━<br>', ...serverInfo);
        }

        // Channel Settings
        const settings = [];
        if (channelInfo.rate_limit_per_user) settings.push(formatLine('Slowmode', `${channelInfo.rate_limit_per_user} seconds`));
        if (channelInfo.nsfw) settings.push(formatLine('NSFW', 'Yes'));
        if (channelInfo.user_limit) settings.push(formatLine('User Limit', channelInfo.user_limit));
        if (channelInfo.bitrate) settings.push(formatLine('Bitrate', `${channelInfo.bitrate / 1000}kbps`));

        if (settings.length > 0) {
            lines.push('<br>━━━ Channel Settings ━━━<br>', ...settings);
        }

        // Thread Settings (if applicable)
        if (channelInfo.thread_metadata) {
            const threadInfo = [];
            threadInfo.push(formatLine('Auto Archive Duration', `${channelInfo.thread_metadata.auto_archive_duration} minutes`));
            threadInfo.push(formatLine('Archived', channelInfo.thread_metadata.archived ? 'Yes' : 'No'));
            threadInfo.push(formatLine('Locked', channelInfo.thread_metadata.locked ? 'Yes' : 'No'));
            lines.push('<br>━━━ Thread Settings ━━━<br>', ...threadInfo);
        }

        lines.push('━━━━━━━━━━━━━━━━━');

        infoBlock.innerHTML = lines.join('');
        consoleOutput.appendChild(infoBlock);
        this.scrollToBottom(consoleOutput);
    }

    static printGroupDMInfo(channelInfo) {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;

        const infoBlock = document.createElement('div');
        infoBlock.className = 'console-entry info user-info';
        infoBlock.style.whiteSpace = 'pre-wrap';
        infoBlock.style.wordBreak = 'break-word';

        const formatLine = (label, value) => value !== undefined && value !== null ? `${label}: ${value}<br>` : '';
        
        const lines = ['—————— Group DM Information ——————<br>'];

        // Basic Info
        const basicInfo = [];
        basicInfo.push(formatLine('Channel ID', channelInfo.id));
        basicInfo.push(formatLine('Last Message ID', channelInfo.last_message_id));
        basicInfo.push(formatLine('Created At', channelInfo.created_at.toLocaleString()));
        basicInfo.push(formatLine('Owner ID', channelInfo.owner_id));
        basicInfo.push(formatLine('Flags', channelInfo.flags));
        lines.push(...basicInfo);

        // Members Section
        if (channelInfo.recipients && channelInfo.recipients.length > 0) {
            lines.push('<br>—————— Members ——————<br>');
            channelInfo.recipients.forEach((member, index) => {
                lines.push(`${index + 1}. ${member.username}`);
                if (member.global_name) lines.push(` (${member.global_name})`);
                lines.push(` - ID: ${member.id}<br>`);
            });
            lines.push(formatLine('Total Members', channelInfo.recipients.length));
        }

        // Settings Section
        lines.push('<br>—————— Channel Settings ——————<br>');
        const settings = [];
        settings.push(formatLine('Type', 'GROUP_DM'));
        if (channelInfo.name) settings.push(formatLine('Custom Name', channelInfo.name));
        if (channelInfo.icon) settings.push(formatLine('Has Icon', 'Yes'));
        settings.push(formatLine('Blocked User Warning Dismissed', 
            channelInfo.blocked_user_warning_dismissed ? 'Yes' : 'No'));
        lines.push(...settings);

        lines.push('<br>————————————————————');

        infoBlock.innerHTML = lines.join('');
        consoleOutput.appendChild(infoBlock);
        this.scrollToBottom(consoleOutput);
    }
}

ipcRenderer.on('copy-url', (event, url) => {
    require('electron').clipboard.writeText(url);
});

module.exports = Console; 