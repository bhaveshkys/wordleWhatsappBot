# Wordle WhatsApp Bot

A WhatsApp bot built with Baileys that automatically analyzes Wordle results shared in group chats.

## Features

- 🤖 **Automatic Detection**: Recognizes Wordle results when shared in groups
- 📊 **Smart Analysis**: Provides insights on solving patterns and strategies
- 🏆 **Leaderboards**: Track group performance with solve rates and averages
- 📈 **Statistics**: Detailed stats for individual players and groups
- ⚡ **Real-time Reactions**: Reacts to Wordle shares with appropriate emojis
- 🎯 **Pattern Analysis**: Analyzes solving strategies and provides feedback

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Bot**
   ```bash
   npm start
   ```

3. **Connect WhatsApp**
   - Scan the QR code that appears in your terminal with WhatsApp
   - The bot will connect using your personal WhatsApp number

## How It Works

### Automatic Analysis
When someone shares a Wordle result in a group, the bot will:
- Automatically detect the Wordle pattern
- React with 🎉 for solved puzzles or 😔 for failed attempts
- Provide analysis of the solving strategy
- Store results for statistics

### Commands

Use these commands in any group where the bot is active:

- `!wordle stats` - View group statistics
- `!wordle leaderboard` - View group leaderboard
- `!wordle help` - Show available commands

### Example Wordle Result
```
Wordle 1,234 4/6

⬛🟨⬛⬛⬛
⬛⬛🟩🟨⬛
🟨🟩🟩⬛🟩
🟩🟩🟩🟩🟩
```

The bot will automatically:
1. Detect this as a Wordle result
2. Parse the game number (1,234) and attempts (4/6)
3. Analyze the pattern and strategy
4. Provide feedback and store for statistics

## Features in Detail

### Pattern Analysis
- **First Guess Analysis**: Evaluates the effectiveness of opening moves
- **Progress Tracking**: Monitors improvement between attempts
- **Difficulty Assessment**: Rates the solve based on attempts needed
- **Strategy Insights**: Provides tips based on solving patterns

### Statistics Tracking
- **Individual Stats**: Solve rate, average attempts, attempt distribution
- **Group Leaderboards**: Ranked by solve rate and efficiency
- **Historical Data**: Tracks performance over time
- **Visual Charts**: ASCII-based distribution charts

### Smart Features
- **Group-Only Operation**: Only works in group chats for privacy
- **Emoji Reactions**: Automatic reactions to shared results
- **Error Handling**: Robust parsing of various Wordle formats
- **Real-time Updates**: Instant analysis and feedback

## Technical Details

### Built With
- **Baileys**: WhatsApp Web API library
- **Node.js**: Runtime environment
- **ES Modules**: Modern JavaScript module system

### File Structure
```
wordleWhatsAppBot/
├── index.js           # Main bot logic and WhatsApp integration
├── wordleAnalyzer.js  # Wordle parsing and analysis engine
├── package.json       # Dependencies and scripts
└── auth_info_baileys/ # WhatsApp authentication (auto-generated)
```

### Data Storage
- Statistics are stored in memory during runtime
- Authentication data is persisted in `auth_info_baileys/` folder
- No external database required for basic functionality

## Privacy & Security

- **Personal Number**: Uses your personal WhatsApp number
- **Group Only**: Only processes messages in group chats
- **No Data Collection**: Statistics are stored locally only
- **Automatic Reactions**: Only reacts to detected Wordle results

## Development

### Running in Development Mode
```bash
npm run dev
```

This uses Node.js watch mode for automatic restarts during development.

### Extending the Bot

The bot is designed to be easily extensible:

1. **Add New Commands**: Extend the `handleWordleCommand` method
2. **Custom Analysis**: Modify the `WordleAnalyzer` class
3. **Additional Games**: Create new analyzer modules for other word games
4. **Persistent Storage**: Add database integration for long-term statistics

## Troubleshooting

### Common Issues

1. **QR Code Not Appearing**
   - Ensure terminal supports QR code display
   - Check internet connection

2. **Bot Not Responding**
   - Verify the bot is connected (check console logs)
   - Ensure messages are sent in group chats
   - Check that Wordle format is correct

3. **Authentication Issues**
   - Delete `auth_info_baileys/` folder and restart
   - Re-scan QR code with WhatsApp

### Logs
Set logger level to 'debug' in `index.js` for detailed logging:
```javascript
logger: {
    level: 'debug', // Change from 'silent'
    log: console.log
}
```

## Contributing

Feel free to contribute by:
- Adding new analysis features
- Improving pattern recognition
- Adding support for other word games
- Enhancing the user interface

## License

ISC License - Feel free to use and modify as needed.