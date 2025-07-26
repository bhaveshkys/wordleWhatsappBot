import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { WordleAnalyzer } from './wordleAnalyzer.js';
import { GoogleSheetsDB } from './googleSheetsDB.js';

class WordleWhatsAppBot {
    constructor() {
        this.sock = null;
        this.analyzer = new WordleAnalyzer();
        this.db = new GoogleSheetsDB('./wordlebotdb-12e609807b14.json'); // Path to your service account JSON
        this.groupStats = new Map(); // Store group statistics
        this.targetGroupName = 'Wordlepaglu'; // Change back to your target group
        this.targetGroupId = null; // Will be set when group is found
        this.groupMemberCount = 0; // Track group member count
        this.dailySubmissions = new Map(); // Track daily submissions per game
        
        // Configuration
        this.spreadsheetId = '1ve-FHb5UUwlkpz6yY0UxZzeA0fw45VOTET6npSirvlc'; // Replace with your Google Sheets ID
    }

    async start() {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        this.sock = makeWASocket({
            auth: state
        });

        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
        this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

        console.log('🤖 Wordle WhatsApp Bot started!');
        console.log('📱 Scan the QR code with your WhatsApp to connect');
        console.log(`🎯 Bot will only monitor the "${this.targetGroupName}" group`);
        
        // Initialize Google Sheets DB
        try {
            await this.db.initialize(this.spreadsheetId);
        } catch (error) {
            console.error('❌ Failed to initialize Google Sheets DB:', error);
        }
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 QR Code generated, scan with WhatsApp');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                this.start();
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp successfully!');
            // Find the target group and get member count
            await this.findTargetGroup();
        }
    }

    async findTargetGroup() {
        try {
            // Get all chats
            const chats = await this.sock.groupFetchAllParticipating();
            
            // Find the target group by name
            for (const [groupId, groupInfo] of Object.entries(chats)) {
                if (groupInfo.subject === this.targetGroupName) {
                    this.targetGroupId = groupId;
                    console.log(`🎯 Found target group "${this.targetGroupName}" with ID: ${groupId}`);
                    
                    // Get group metadata to count members
                    await this.updateGroupMemberCount(groupId);
                    return;
                }
            }
            
            console.log(`⚠️  Group "${this.targetGroupName}" not found. Available groups:`);
            for (const [groupId, groupInfo] of Object.entries(chats)) {
                console.log(`   - ${groupInfo.subject} (${groupId})`);
            }
        } catch (error) {
            console.error('Error finding target group:', error);
        }
    }

    async updateGroupMemberCount(groupId) {
        try {
            const groupMetadata = await this.sock.groupMetadata(groupId);
            this.groupMemberCount = groupMetadata.participants.length;
            
            console.log(`👥 Group "${groupMetadata.subject}" has ${this.groupMemberCount} members`);
            
            // Update in Google Sheets
            await this.db.updateGroupMembers(groupId, groupMetadata.subject, this.groupMemberCount);
            
        } catch (error) {
            console.error('Error getting group member count:', error);
        }
    }

    async handleMessages(m) {
        const message = m.messages[0];
        if (!message.message) return;

        const messageText = message.message.conversation || 
                           message.message.extendedTextMessage?.text || '';
        
        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const isFromMe = message.key.fromMe;
        const sender = isFromMe ? 'You' : (message.pushName || message.key.participant?.split('@')[0] || 'Unknown');
        
        // Log all incoming messages for debugging
        console.log('\n📨 Message received:');
        console.log(`   From: ${sender} ${isFromMe ? '(YOU)' : ''}`);
        console.log(`   Chat ID: ${chatId}`);
        console.log(`   Is Group: ${isGroup}`);
        console.log(`   Text: "${messageText}"`);
        
        // Only process messages in groups
        if (!isGroup) {
            console.log('   ❌ Skipped: Not a group message');
            return;
        }

        // Check if this is our target group
        let isTargetGroup = false;
        
        if (isGroup) {
            // Only process messages from the target group
            if (this.targetGroupId && chatId !== this.targetGroupId) {
                console.log(`   ❌ Skipped: Not the target group (${this.targetGroupName})`);
                return; // Ignore messages from other groups
            }

            // If we haven't found the target group yet, try to find it by name
            if (!this.targetGroupId) {
                try {
                    const groupMetadata = await this.sock.groupMetadata(chatId);
                    console.log(`   📋 Group name: "${groupMetadata.subject}"`);
                    
                    if (groupMetadata.subject !== this.targetGroupName) {
                        console.log(`   ❌ Skipped: Not target group (looking for "${this.targetGroupName}")`);
                        return; // Not our target group
                    }
                    // Found the target group!
                    this.targetGroupId = chatId;
                    console.log(`   🎯 Found and set target group "${this.targetGroupName}"`);
                    await this.updateGroupMemberCount(chatId);
                    isTargetGroup = true;
                } catch (error) {
                    console.error('   ❌ Error getting group metadata:', error);
                    return;
                }
            } else {
                isTargetGroup = true;
            }

            if (isTargetGroup) {
                console.log(`   ✅ Message from ${this.targetGroupName}`);
            }
        }

        // Skip processing if message is from the bot itself
        if (isFromMe) {
            console.log('   ℹ️  Skipped processing: Message from bot itself');
            console.log('   ✅ Message logging complete\n');
            return;
        }

        // Check if message contains Wordle results
        const isWordleResult = this.analyzer.isWordleResult(messageText);
        console.log(`   🎯 Is Wordle result: ${isWordleResult}`);
        
        if (isWordleResult) {
            console.log('   🎮 Processing Wordle result...');
            await this.processWordleResult(message, messageText, chatId);
        }

        // Handle bot commands
        const isCommand = messageText.startsWith('!wordle');
        console.log(`   🤖 Is bot command: ${isCommand}`);
        
        if (isCommand) {
            console.log('   ⚡ Processing bot command...');
            await this.handleWordleCommand(message, messageText, chatId);
        }
        
        console.log('   ✅ Message processing complete\n');
    }

    async processWordleResult(message, messageText, chatId) {
        try {
            const result = this.analyzer.parseWordleResult(messageText);
            if (!result) {
                console.log('   ❌ Failed to parse Wordle result');
                return;
            }

            const sender = message.pushName || message.key.participant?.split('@')[0] || 'Unknown';
            
            console.log(`   📊 Parsed Wordle result:`);
            console.log(`      Game: ${result.gameNumber}`);
            console.log(`      Attempts: ${result.actualAttempts}/6`);
            console.log(`      Solved: ${result.solved}`);
            console.log(`      Score: ${result.score.totalScore} (${result.score.baseScore} + ${result.score.emojiPoints})`);
            console.log(`      Pattern lines: ${result.pattern.length}`);
            
            // Add player name and date to result
            const resultWithPlayer = {
                ...result,
                player: sender,
                date: new Date().toISOString().split('T')[0],
                timestamp: Date.now()
            };
            
            // Save to Google Sheets
            await this.db.saveWordleResult(resultWithPlayer, chatId);
            
            // Track daily submissions
            const gameKey = `${chatId}-${result.gameNumber}`;
            if (!this.dailySubmissions.has(gameKey)) {
                this.dailySubmissions.set(gameKey, new Set());
            }
            this.dailySubmissions.get(gameKey).add(sender);
            
            console.log(`   📊 Daily submissions for game ${result.gameNumber}: ${this.dailySubmissions.get(gameKey).size}/${this.groupMemberCount}`);

            // Store result in local stats for quick access
            if (!this.groupStats.has(chatId)) {
                this.groupStats.set(chatId, new Map());
            }
            
            const groupData = this.groupStats.get(chatId);
            if (!groupData.has(sender)) {
                groupData.set(sender, []);
            }
            
            groupData.get(sender).push(resultWithPlayer);
            console.log(`   💾 Stored result for ${sender} (total: ${groupData.get(sender).length} games)`);

            // React to the message
            const reactionEmoji = result.solved ? '🎉' : '😔';
            console.log(`   ${reactionEmoji} Reacting to message...`);
            
            await this.sock.sendMessage(chatId, {
                react: {
                    text: reactionEmoji,
                    key: message.key
                }
            });

            // Send analysis with score information
            if (result.solved) {
                const analysis = this.analyzer.analyzePattern(result.pattern, result.score);
                const responseText = `🎯 Great job ${sender}!\n` +
                                   `📊 Wordle ${result.gameNumber} - ${result.actualAttempts}/6\n` +
                                   `🔍 ${analysis}`;
                
                console.log(`   💬 Sending analysis message...`);
                await this.sock.sendMessage(chatId, { text: responseText });
            } else {
                // Send encouragement for failed attempts
                const responseText = `💪 Keep trying ${sender}!\n` +
                                   `📊 Wordle ${result.gameNumber} - X/6\n` +
                                   `🏆 Score: ${result.score.totalScore} points (${result.score.emojiPoints} emoji points)`;
                
                console.log(`   💬 Sending encouragement message...`);
                await this.sock.sendMessage(chatId, { text: responseText });
            }

            // Check if everyone has submitted for today's game
            await this.checkForCompleteSubmissions(chatId, result.gameNumber);

        } catch (error) {
            console.error('   ❌ Error processing Wordle result:', error);
        }
    }

    async checkForCompleteSubmissions(chatId, gameNumber) {
        try {
            const gameKey = `${chatId}-${gameNumber}`;
            const submissions = this.dailySubmissions.get(gameKey);
            
            if (submissions && submissions.size >= this.groupMemberCount) {
                console.log(`🎉 All ${this.groupMemberCount} members have submitted for game ${gameNumber}!`);
                
                // Send daily leaderboard
                await this.sendDailyLeaderboard(chatId, gameNumber);
                
                // Send total leaderboard
                setTimeout(async () => {
                    await this.sendTotalLeaderboard(chatId);
                }, 2000); // Wait 2 seconds between messages
            }
        } catch (error) {
            console.error('❌ Error checking complete submissions:', error);
        }
    }

    async sendDailyLeaderboard(chatId, gameNumber) {
        try {
            const dailyResults = await this.db.getDailyResults(gameNumber);
            
            if (dailyResults.length === 0) {
                return;
            }

            // Sort by total score (descending)
            const sortedResults = dailyResults.sort((a, b) => {
                if (b.totalScore !== a.totalScore) {
                    return b.totalScore - a.totalScore;
                }
                // If total scores are equal, sort by base score (fewer attempts wins)
                return b.baseScore - a.baseScore;
            });

            let leaderboard = `🏆 *Daily Leaderboard - Wordle ${gameNumber}*\n\n`;
            
            sortedResults.forEach((result, index) => {
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                const attempts = result.solved ? `${result.attempts}/6` : 'X/6';
                
                leaderboard += `${medal} *${result.player}*\n`;
                leaderboard += `   ${attempts} - ${result.totalScore} points\n`;
                leaderboard += `   (${result.baseScore} base + ${result.emojiPoints} emoji)\n\n`;
            });

            await this.sock.sendMessage(chatId, { text: leaderboard });
            console.log(`📊 Sent daily leaderboard for game ${gameNumber}`);
            
        } catch (error) {
            console.error('❌ Error sending daily leaderboard:', error);
        }
    }

    async sendTotalLeaderboard(chatId) {
        try {
            const totalLeaderboard = await this.db.getTotalLeaderboard();
            
            if (totalLeaderboard.length === 0) {
                return;
            }

            let leaderboard = `🏆 *Total Leaderboard - All Time*\n\n`;
            
            totalLeaderboard.forEach((stats, index) => {
                const rank = index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                
                leaderboard += `${medal} *${stats.player}*\n`;
                leaderboard += `   🏆 ${stats.totalScore} total points\n`;
                leaderboard += `   📊 ${stats.solveRate}% solve rate (${stats.solvedGames}/${stats.totalGames})\n`;
                leaderboard += `   ⚡ ${stats.avgAttempts} avg attempts\n\n`;
            });

            await this.sock.sendMessage(chatId, { text: leaderboard });
            console.log(`📊 Sent total leaderboard`);
            
        } catch (error) {
            console.error('❌ Error sending total leaderboard:', error);
        }
    }

    async handleWordleCommand(message, messageText, chatId) {
        const args = messageText.split(' ');
        const command = args[1]?.toLowerCase();
        const sender = message.pushName || message.key.participant?.split('@')[0] || 'Unknown';

        console.log(`   🤖 Command "${command}" from ${sender}`);

        try {
            switch (command) {
                case 'stats':
                    console.log('   📊 Sending group stats...');
                    await this.sendGroupStats(chatId);
                    break;
                case 'leaderboard':
                    console.log('   🏆 Sending leaderboard...');
                    await this.sendLeaderboard(chatId);
                    break;
                case 'help':
                    console.log('   ❓ Sending help...');
                    await this.sendHelp(chatId);
                    break;
                default:
                    console.log('   ❓ Unknown command, sending help...');
                    await this.sendHelp(chatId);
            }
        } catch (error) {
            console.error('   ❌ Error handling command:', error);
        }
    }

    async sendGroupStats(chatId) {
        const groupData = this.groupStats.get(chatId);
        if (!groupData || groupData.size === 0) {
            await this.sock.sendMessage(chatId, { 
                text: '📊 No Wordle results found in this group yet!' 
            });
            return;
        }

        let statsText = '📊 *Group Wordle Statistics*\n\n';
        
        for (const [player, results] of groupData) {
            const stats = this.analyzer.getPlayerStats(results);
            
            statsText += `👤 *${player}*\n`;
            statsText += `   ✅ Solved: ${stats.solvedGames}/${stats.totalGames} (${stats.solveRate.toFixed(1)}%)\n`;
            statsText += `   📈 Avg attempts: ${stats.averageAttempts.toFixed(1)}\n`;
            statsText += `   🏆 Total score: ${stats.totalScore} points\n`;
            statsText += `   📊 Avg score: ${stats.averageScore.toFixed(1)} points\n\n`;
        }

        await this.sock.sendMessage(chatId, { text: statsText });
    }

    async sendLeaderboard(chatId) {
        const groupData = this.groupStats.get(chatId);
        if (!groupData || groupData.size === 0) {
            await this.sock.sendMessage(chatId, { 
                text: '🏆 No Wordle results found for leaderboard!' 
            });
            return;
        }

        const playerStats = [];
        
        for (const [player, results] of groupData) {
            const stats = this.analyzer.getPlayerStats(results);
            playerStats.push({
                player,
                ...stats
            });
        }

        // Sort by total score (descending), then by solve rate, then by average attempts
        playerStats.sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            if (b.solveRate !== a.solveRate) return b.solveRate - a.solveRate;
            return a.averageAttempts - b.averageAttempts;
        });

        let leaderboardText = '🏆 *Overall Wordle Leaderboard*\n\n';
        
        playerStats.forEach((stats, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            leaderboardText += `${medal} *${stats.player}*\n`;
            leaderboardText += `   🏆 ${stats.totalScore} total points\n`;
            leaderboardText += `   📊 ${stats.solveRate.toFixed(1)}% solve rate (${stats.solvedGames}/${stats.totalGames})\n`;
            leaderboardText += `   ⚡ ${stats.averageAttempts.toFixed(1)} avg attempts\n\n`;
        });

        await this.sock.sendMessage(chatId, { text: leaderboardText });
    }

    async sendHelp(chatId) {
        const helpText = `🤖 *Wordle Bot Commands*\n\n` +
                        `📊 \`!wordle stats\` - View group statistics\n` +
                        `🏆 \`!wordle leaderboard\` - View overall leaderboard\n` +
                        `❓ \`!wordle help\` - Show this help\n\n` +
                        `💡 *How it works:*\n` +
                        `Just share your Wordle results in the group and I'll automatically analyze them!\n\n` +
                        `🏆 *Scoring System:*\n` +
                        `• 1 attempt: 600 points\n` +
                        `• 2 attempts: 500 points\n` +
                        `• 3 attempts: 400 points\n` +
                        `• 4 attempts: 300 points\n` +
                        `• 5 attempts: 200 points\n` +
                        `• 6 attempts: 100 points\n` +
                        `• Failed (X): 0 points\n` +
                        `• Bonus: 🟩 = +2 pts, 🟨 = +1 pt\n\n` +
                        `Example Wordle result:\n` +
                        `Wordle 1,234 4/6\n` +
                        `⬛🟨⬛⬛⬛\n` +
                        `⬛⬛🟩🟨⬛\n` +
                        `🟨🟩🟩⬛🟩\n` +
                        `🟩🟩🟩🟩🟩`;

        await this.sock.sendMessage(chatId, { text: helpText });
    }
}

// Start the bot
const bot = new WordleWhatsAppBot();
bot.start().catch(console.error);