# Discord Tool - Electron

Discord Tool is an Electron-based application designed as a tool to help manage Discord accounts and data. It provides a variety of features to interact with Discord's API, allowing users to manage direct messages, servers, and more.

## Features

### Account Management
- Securely save and manage multiple Discord accounts
- Quick account switching with saved tokens
- Visual account selection with usernames and avatars
- Remember me functionality for frequently used accounts

### Media Viewer
- Browse and download media (images, videos, GIFs) from DMs and servers as fast as possible with preloading and caching
- Smart duplicate detection to avoid saving the same media multiple times
- Autoplay functionality with customizable delay
- Keyboard shortcuts for quick navigation and saving
- Batch download capabilities
- Video playback controls with adjustable volume
- Save location management per user account
- Media information display (filename, size, date)
- Search and filter channels for easy access
- Supports both server-wide and channel-specific media viewing

### View Open DMs
- Manage and delete messages from your active direct message channels
- Set message deletion filters such as date range and specific text
- Option to automatically close DMs after deletion
- Adjustable delay between operations to prevent rate limiting
- View message counts before deleting to understand the impact

### Accessible Servers
- Manage messages across servers you have access to
- Batch delete messages from multiple servers with ease
- Filter messages by date range, content, or specific user IDs
- Option to leave servers after message deletion
- Target specific channels using Channel ID for precise control

### Find Closed DMs
- batch open closed DMs functionality (discord limits to 1000 open DMs at a time)
- Locate and recover closed DM channels using your Discord data file
- Filter between open and closed DMs to focus on what you need
- Easily reopen closed conversations with a single click
- Search functionality to quickly find specific users or conversations

### Message Wiper
- Advanced tools for removing messages from your account
- Upload Discord data to view all message history
- Track deletion progress with detailed statistics
- Filter channels by type (DM/Server) and manage them in large batch operations
- Save channel states for long-term operations, allowing you to pause and resume as needed

### User and Server Information
- Retrieve detailed information about users and servers
- View user profiles, including avatars and badges
- Access server details such as member counts and server features

### Batch Operations with GUI
- The application provides an easy-to-use graphical user interface (GUI) for managing all operations
- Perform large batch operations with minimal effort, thanks to intuitive controls and real-time feedback
- Use filters and search functions to manage large numbers of channels and messages efficiently

## Project Structure

- **src/components**: Contains reusable components like `Navigation` and `Console`
- **src/screens**: Contains different screens for the application, such as `AuthScreen`, `MediaViewerScreen`, `OpenDMsScreen`, `ServersScreen`, etc.
- **src/utils**: Utility functions and classes for interacting with Discord's API
- **main.js**: Main entry point for the Electron application
- **index.html**: HTML file that serves as the main UI container
- **package.json**: Contains project metadata and dependencies

## Getting Started

### Prerequisites

- Node.js and npm installed on your machine

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/discord-tool-electron.git
   cd discord-tool-electron
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

To start the application in development mode, run:

```bash
npm start
```

This will launch the Electron application, allowing you to interact with the Discord Tool.

### Building the Application

To compile the application for distribution, run:

```bash
npm run build
```

This will create a production-ready build in the `release` directory, which you can distribute and run on other machines.

## Keyboard Shortcuts

### Media Viewer
- `←` Previous media
- `→` Next media
- `↑` Save current media and move to next
- `↓` Undo last save
- `S` Save all media in current view

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.