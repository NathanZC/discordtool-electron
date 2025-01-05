# Discord Tool - Electron

Discord Tool is an Electron-based application designed to help manage Discord accounts. It provides a variety of features to interact with Discord's API, allowing users to manage direct messages, servers, and more.

## Features

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
- **src/screens**: Contains different screens for the application, such as `AuthScreen`, `OpenDMsScreen`, `ServersScreen`, etc.
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

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.