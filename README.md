# Discord Tool

A powerful desktop application for managing Discord data and messages. Built with Electron for performance and reliability.

## ⚠️ Important Notice

This tool operates as a self-bot when interacting with the Discord API to manage messages and data. Using self-bots is against Discord's Terms of Service and there is a risk of account action, however, it is small and there are currently no known bans for this.

*Use this tool at your own discretion.*

## Download

### Latest Release: v2.0.2 - Discord Tool

Fast and efficient Discord data manager with enhanced search, media downloading, and message management capabilities. Built for performance and ease of use.

[Download for Windows](https://github.com/NathanZC/discordtool-electron/releases/download/v2.0.3/discord-tool.Setup.2.0.3.exe)

*Note: Requires Discord token for authentication. All operations are client-side.*

## Key Features

### Enhanced Search
- Global search across all DMs at once
- Advanced filtering by date, content type, and author
- Bulk message management and deletion for filtered messages
- Real-time search updates with progressive loading
- Direct message jumping capability

<div align="center">
  <img src="https://github.com/user-attachments/assets/1f0f19a8-3ebe-4c68-b049-0f4efd67d901" alt="Discord Tool Search Interface" width="800"/>
  <p><em>Enhanced Search Interface with Advanced Filtering</em></p>
</div>

### Media Viewer
- Fast media browsing with smart caching and preloading
- Keyboard-driven workflow for efficient navigation
- Batch download capabilities with duplicate detection
- Support for images, videos, GIFs, and other media types
- Customizable playback controls and autoplay settings

<div align="center">
  <img src="https://github.com/user-attachments/assets/38c11b5a-5089-4659-a44d-d3167b97dc69" alt="Discord Tool Media Interface" width="800"/>
  <p><em>Media Management Interface with Batch Operations</em></p>
</div>

### Message Management
- **Open DMs**: Manage active conversations and message history
- **Servers**: Process messages across multiple servers efficiently
- **Closed DMs**: Recover and manage archived conversations
- **Message Wiper**: Comprehensive message deletion tools
- Advanced filtering options for precise control

### Smart Features
- Secure token-based authentication
- Multi account management (save and manage unlimited accounts)
- Automatic rate limit handling
- Progress tracking for long operations
- Local caching for improved performance
- Intuitive user interface

## Getting Started

### Prerequisites
- Node.js (LTS version recommended)
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/discord-tool.git

# Install dependencies
npm install

# Start the application
npm start
```

### Building for Distribution
```bash
npm run build
```

## Keyboard Shortcuts

### Media Viewer
- `←/→` Navigate between media
- `↑` Save current and advance
- `↓` Undo last save
- `S` Save all loaded media
- `F` Toggle fullscreen

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
