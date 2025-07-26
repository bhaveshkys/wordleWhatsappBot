import { google } from 'googleapis';
import fs from 'fs';

export class GoogleSheetsDB {
    constructor(credentialsPath) {
        this.credentialsPath = credentialsPath;
        this.sheets = null;
        this.spreadsheetId = null;
        this.auth = null;
    }

    async initialize(spreadsheetId) {
        try {
            // Load service account credentials
            const credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
            
            console.log('🔑 Loading Google Sheets credentials...');
            console.log(`📧 Service account email: ${credentials.client_email}`);
            
            // Create JWT auth with proper key handling
            this.auth = new google.auth.JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            console.log('🔐 Authorizing Google Sheets access...');
            // Authorize the client
            await this.auth.authorize();
            console.log('✅ Google Sheets authentication successful');

            // Initialize sheets API
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.spreadsheetId = spreadsheetId;

            console.log('✅ Google Sheets DB initialized successfully');
            console.log(`📊 Spreadsheet ID: ${spreadsheetId}`);
            console.log(`⚠️  Make sure the spreadsheet is shared with the service account email!`);
            
            // Test access to the spreadsheet
            await this.testSpreadsheetAccess();
            
            // Create necessary sheets if they don't exist
            await this.createSheetsIfNeeded();
            
        } catch (error) {
            console.error('❌ Error initializing Google Sheets DB:', error);
            
            if (error.message.includes('No key or keyFile set')) {
                console.error('🔑 KEY ERROR: Problem with the private key in the service account file');
                console.error('🔧 Please check that the private key is properly formatted in the JSON file');
            } else if (error.message.includes('PERMISSION_DENIED') || error.code === 403) {
                console.error('🔒 PERMISSION ERROR: The spreadsheet is not shared with the service account!');
                try {
                    const creds = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
                    console.error(`📧 Please share the spreadsheet with: ${creds.client_email}`);
                } catch (e) {
                    console.error('📧 Please share the spreadsheet with the service account email');
                }
                console.error('🔧 Steps to fix:');
                console.error('   1. Open your Google Spreadsheet');
                console.error('   2. Click "Share" button');
                console.error('   3. Add the service account email as an Editor');
                console.error('   4. Restart the bot');
            }
            
            // Set sheets to null to prevent further errors
            this.sheets = null;
            this.auth = null;
        }
    }

    async testSpreadsheetAccess() {
        try {
            console.log('🔍 Testing spreadsheet access...');
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            console.log(`✅ Successfully accessed spreadsheet: "${response.data.properties.title}"`);
            return true;
        } catch (error) {
            console.error('❌ Failed to access spreadsheet:', error.message);
            throw error;
        }
    }

    async createSheetsIfNeeded() {
        try {
            // Get existing sheets
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const existingSheets = response.data.sheets.map(sheet => sheet.properties.title);
            console.log(`📋 Existing sheets: ${existingSheets.join(', ')}`);
            
            // Create sheets if they don't exist
            const requiredSheets = ['DailyResults', 'TotalScores', 'GroupMembers'];
            
            for (const sheetName of requiredSheets) {
                if (!existingSheets.includes(sheetName)) {
                    await this.createSheet(sheetName);
                } else {
                    console.log(`✅ Sheet "${sheetName}" already exists`);
                }
            }

            // Initialize headers if needed
            await this.initializeHeaders();

        } catch (error) {
            console.error('❌ Error creating sheets:', error);
            throw error;
        }
    }

    async createSheet(title) {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: title
                            }
                        }
                    }]
                }
            });
            console.log(`✅ Created sheet: ${title}`);
        } catch (error) {
            console.error(`❌ Error creating sheet ${title}:`, error);
            throw error;
        }
    }

    async initializeHeaders() {
        try {
            // Check if headers already exist before initializing
            const dailyHeaders = await this.getRange('DailyResults!A1:H1');
            if (dailyHeaders.length === 0) {
                await this.updateRange('DailyResults!A1:H1', [[
                    'Date', 'GameNumber', 'Player', 'Attempts', 'Solved', 'BaseScore', 'EmojiPoints', 'TotalScore'
                ]]);
                console.log('✅ Initialized DailyResults headers');
            }

            const totalHeaders = await this.getRange('TotalScores!A1:F1');
            if (totalHeaders.length === 0) {
                await this.updateRange('TotalScores!A1:F1', [[
                    'Player', 'TotalGames', 'SolvedGames', 'SolveRate', 'AvgAttempts', 'TotalScore'
                ]]);
                console.log('✅ Initialized TotalScores headers');
            }

            const memberHeaders = await this.getRange('GroupMembers!A1:C1');
            if (memberHeaders.length === 0) {
                await this.updateRange('GroupMembers!A1:C1', [[
                    'GroupId', 'GroupName', 'MemberCount'
                ]]);
                console.log('✅ Initialized GroupMembers headers');
            }
        } catch (error) {
            console.error('❌ Error initializing headers:', error);
            throw error;
        }
    }

    // Check if sheets API is available before making calls
    isAvailable() {
        return this.sheets !== null && this.auth !== null;
    }

    async saveWordleResult(result, groupId) {
        if (!this.isAvailable()) {
            console.log('⚠️  Google Sheets not available, skipping save');
            return;
        }

        try {
            const row = [
                result.date,
                result.gameNumber,
                result.player,
                result.actualAttempts,
                result.solved,
                result.score.baseScore,
                result.score.emojiPoints,
                result.score.totalScore
            ];

            await this.appendRow('DailyResults', row);
            console.log(`💾 Saved result to Google Sheets: ${result.player} - Game ${result.gameNumber}`);
            
            // Update total scores
            await this.updateTotalScores(result.player);
            
        } catch (error) {
            console.error('❌ Error saving Wordle result:', error);
        }
    }

    async updateTotalScores(player) {
        if (!this.isAvailable()) return;

        try {
            // Get all results for this player
            const results = await this.getPlayerResults(player);
            
            if (results.length === 0) return;

            const solved = results.filter(r => r.solved);
            const totalScore = results.reduce((sum, r) => sum + r.totalScore, 0);
            const avgAttempts = solved.length > 0 ? 
                solved.reduce((sum, r) => sum + parseInt(r.attempts), 0) / solved.length : 0;
            const solveRate = (solved.length / results.length) * 100;

            // Check if player exists in TotalScores
            const existingData = await this.getRange('TotalScores!A:F');
            const playerRowIndex = existingData.findIndex(row => row[0] === player);

            const newRow = [
                player,
                results.length,
                solved.length,
                solveRate.toFixed(1),
                avgAttempts.toFixed(1),
                totalScore
            ];

            if (playerRowIndex === -1) {
                // Add new player
                await this.appendRow('TotalScores', newRow);
            } else {
                // Update existing player
                const range = `TotalScores!A${playerRowIndex + 1}:F${playerRowIndex + 1}`;
                await this.updateRange(range, [newRow]);
            }

        } catch (error) {
            console.error('❌ Error updating total scores:', error);
        }
    }

    async getPlayerResults(player) {
        if (!this.isAvailable()) return [];

        try {
            const data = await this.getRange('DailyResults!A:H');
            return data.slice(1) // Skip header
                .filter(row => row[2] === player) // Filter by player
                .map(row => ({
                    date: row[0],
                    gameNumber: parseInt(row[1]),
                    player: row[2],
                    attempts: row[3],
                    solved: row[4] === 'TRUE',
                    baseScore: parseInt(row[5]),
                    emojiPoints: parseInt(row[6]),
                    totalScore: parseInt(row[7])
                }));
        } catch (error) {
            console.error('❌ Error getting player results:', error);
            return [];
        }
    }

    async getDailyResults(gameNumber) {
        if (!this.isAvailable()) return [];

        try {
            const data = await this.getRange('DailyResults!A:H');
            return data.slice(1) // Skip header
                .filter(row => parseInt(row[1]) === gameNumber)
                .map(row => ({
                    date: row[0],
                    gameNumber: parseInt(row[1]),
                    player: row[2],
                    attempts: row[3],
                    solved: row[4] === 'TRUE',
                    baseScore: parseInt(row[5]),
                    emojiPoints: parseInt(row[6]),
                    totalScore: parseInt(row[7])
                }));
        } catch (error) {
            console.error('❌ Error getting daily results:', error);
            return [];
        }
    }

    async getTotalLeaderboard() {
        if (!this.isAvailable()) return [];

        try {
            const data = await this.getRange('TotalScores!A:F');
            return data.slice(1) // Skip header
                .map(row => ({
                    player: row[0],
                    totalGames: parseInt(row[1]),
                    solvedGames: parseInt(row[2]),
                    solveRate: parseFloat(row[3]),
                    avgAttempts: parseFloat(row[4]),
                    totalScore: parseInt(row[5])
                }))
                .sort((a, b) => b.totalScore - a.totalScore);
        } catch (error) {
            console.error('❌ Error getting total leaderboard:', error);
            return [];
        }
    }

    async updateGroupMembers(groupId, groupName, memberCount) {
        if (!this.isAvailable()) {
            console.log('⚠️  Google Sheets not available, skipping group member update');
            return;
        }

        try {
            const existingData = await this.getRange('GroupMembers!A:C');
            const groupRowIndex = existingData.findIndex(row => row[0] === groupId);

            const newRow = [groupId, groupName, memberCount];

            if (groupRowIndex === -1) {
                await this.appendRow('GroupMembers', newRow);
            } else {
                const range = `GroupMembers!A${groupRowIndex + 1}:C${groupRowIndex + 1}`;
                await this.updateRange(range, [newRow]);
            }

            console.log(`📊 Updated group members: ${groupName} (${memberCount} members)`);
        } catch (error) {
            console.error('❌ Error updating group members:', error);
        }
    }

    async getGroupMemberCount(groupId) {
        if (!this.isAvailable()) return 0;

        try {
            const data = await this.getRange('GroupMembers!A:C');
            const groupRow = data.find(row => row[0] === groupId);
            return groupRow ? parseInt(groupRow[2]) : 0;
        } catch (error) {
            console.error('❌ Error getting group member count:', error);
            return 0;
        }
    }

    async appendRow(sheetName, values) {
        if (!this.isAvailable()) {
            throw new Error('Google Sheets not available');
        }

        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [values]
                }
            });
        } catch (error) {
            console.error(`❌ Error appending row to ${sheetName}:`, error);
            throw error;
        }
    }

    async updateRange(range, values) {
        if (!this.isAvailable()) {
            throw new Error('Google Sheets not available');
        }

        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                requestBody: {
                    values: values
                }
            });
        } catch (error) {
            console.error(`❌ Error updating range ${range}:`, error);
            throw error;
        }
    }

    async getRange(range) {
        if (!this.isAvailable()) {
            return [];
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });
            return response.data.values || [];
        } catch (error) {
            console.error(`❌ Error getting range ${range}:`, error);
            if (error.code === 403) {
                console.error('🔒 Permission denied. Make sure the spreadsheet is shared with the service account!');
            }
            return [];
        }
    }
}