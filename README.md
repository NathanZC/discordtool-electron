# Discord Tool

A powerful desktop application for managing Discord data and messages. Built with Electron for performance and reliability.

## Key Features

### Enhanced Search
- Global search across all DMs and servers
- Advanced filtering by date, content type, and author
- Bulk message management and deletion
- Real-time search updates with progressive loading
- Direct message jumping capability

### Media Viewer
- Fast media browsing with smart caching and preloading
- Keyboard-driven workflow for efficient navigation
- Batch download capabilities with duplicate detection
- Support for images, videos, GIFs, and other media types
- Customizable playback controls and autoplay settings

### Message Management
- **Open DMs**: Manage active conversations and message history
- **Servers**: Process messages across multiple servers efficiently
- **Closed DMs**: Recover and manage archived conversations
- **Message Wiper**: Comprehensive message deletion tools
- Advanced filtering options for precise control

### Smart Features
- Secure token-based authentication
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

## Best Practices

1. **Message Management**
   - Use date filters to target specific time periods
   - Enable "Only Me" when managing personal messages
   - Set reasonable delays to avoid rate limits

2. **Media Handling**
   - Set save location before starting downloads
   - Use filters to find specific content types
   - Let initial loading complete for smoother operation

3. **Search Operations**
   - Start with broad searches, then refine
   - Use channel filters for focused results
   - Check message counts before bulk operations

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.