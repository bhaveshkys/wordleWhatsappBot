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
            const requiredSheets = ['DailyResults', 'TotalScores', 'GroupMembers', 'TournamentResults'];
            
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
                    'Player', 'TotalScore', 'GamesPlayed', 'AverageScore', 'BestScore', 'LastUpdated'
                ]]);
                console.log('✅ Initialized TotalScores headers');
            }

            const groupHeaders = await this.getRange('GroupMembers!A1:D1');
            if (groupHeaders.length === 0) {
                await this.updateRange('GroupMembers!A1:D1', [[
                    'GroupId', 'GroupName', 'MemberCount', 'LastUpdated'
                ]]);
                console.log('✅ Initialized GroupMembers headers');
            }
            
            // Initialize tournament headers
            const tournamentHeaders = await this.getRange('TournamentResults!A1:G1');
            if (tournamentHeaders.length === 0) {
                await this.updateRange('TournamentResults!A1:G1', [[
                    'TournamentId', 'Player', 'TotalScore', 'GamesPlayed', 'AverageScore', 'StartDate', 'EndDate'
                ]]);
                console.log('✅ Initialized TournamentResults headers');
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
        // Add these methods before the existing appendRow method
    
    async getTournamentResults(tournamentId, startDate, endDate) {
        try {
            // Get all daily results within the tournament period
            const data = await this.getRange('DailyResults!A:H');
            if (data.length <= 1) return [];
            
            const tournamentData = new Map();
            
            // Filter results by date range
            data.slice(1).forEach(row => {
                const [dateStr, gameNumber, player, attempts, solved, baseScore, emojiPoints, totalScore] = row;
                const resultDate = new Date(dateStr);
                
                if (resultDate >= startDate && resultDate <= endDate) {
                    if (!tournamentData.has(player)) {
                        tournamentData.set(player, {
                            player,
                            totalScore: 0,
                            gamesPlayed: 0,
                            scores: []
                        });
                    }
                    
                    const playerData = tournamentData.get(player);
                    const score = parseInt(totalScore) || 0;
                    playerData.totalScore += score;
                    playerData.gamesPlayed += 1;
                    playerData.scores.push(score);
                }
            });
            
            // Convert to array and calculate averages
            const results = Array.from(tournamentData.values()).map(player => ({
                ...player,
                avgScore: player.gamesPlayed > 0 ? player.totalScore / player.gamesPlayed : 0
            }));
            
            // Sort by total score descending
            results.sort((a, b) => b.totalScore - a.totalScore);
            
            // Save tournament results
            await this.saveTournamentResults(tournamentId, results, startDate, endDate);
            
            return results;
            
        } catch (error) {
            console.error('❌ Error getting tournament results:', error);
            return [];
        }
    }
    
    async saveTournamentResults(tournamentId, results, startDate, endDate) {
        try {
            // Clear existing tournament results for this tournament
            const existingData = await this.getRange('TournamentResults!A:G');
            const filteredData = existingData.filter(row => row[0] !== tournamentId);
            
            // Add header back if we cleared everything
            if (filteredData.length === 0) {
                filteredData.push(['TournamentId', 'Player', 'TotalScore', 'GamesPlayed', 'AverageScore', 'StartDate', 'EndDate']);
            }
            
            // Add new tournament results
            results.forEach(player => {
                filteredData.push([
                    tournamentId,
                    player.player,
                    player.totalScore,
                    player.gamesPlayed,
                    player.avgScore.toFixed(2),
                    startDate.toISOString().split('T')[0],
                    endDate.toISOString().split('T')[0]
                ]);
            });
            
            // Update the sheet
            await this.updateRange('TournamentResults!A:G', filteredData);
            console.log(`✅ Saved tournament results for ${tournamentId}`);
            
        } catch (error) {
            console.error('❌ Error saving tournament results:', error);
        }
    }
    
    async getPreviousTournaments() {
        try {
            const data = await this.getRange('TournamentResults!A:G');
            if (data.length <= 1) return [];
            
            const tournaments = new Map();
            
            // Group by tournament ID
            data.slice(1).forEach(row => {
                const [tournamentId, player, totalScore, gamesPlayed, avgScore, startDate, endDate] = row;
                
                if (!tournaments.has(tournamentId)) {
                    tournaments.set(tournamentId, {
                        tournamentId,
                        players: [],
                        startDate,
                        endDate
                    });
                }
                
                tournaments.get(tournamentId).players.push({
                    player,
                    totalScore: parseInt(totalScore) || 0,
                    gamesPlayed: parseInt(gamesPlayed) || 0,
                    avgScore: parseFloat(avgScore) || 0
                });
            });
            
            // Convert to array and get tournament summaries
            const tournamentList = Array.from(tournaments.values()).map(tournament => {
                // Sort players by score
                tournament.players.sort((a, b) => b.totalScore - a.totalScore);
                
                return {
                    tournamentId: tournament.tournamentId,
                    winner: tournament.players[0]?.player || 'No participants',
                    winnerScore: tournament.players[0]?.totalScore || 0,
                    participants: tournament.players.length,
                    startDate: tournament.startDate,
                    endDate: tournament.endDate
                };
            });
            
            // Sort by tournament ID descending (most recent first)
            tournamentList.sort((a, b) => b.tournamentId.localeCompare(a.tournamentId));
            
            return tournamentList;
            
        } catch (error) {
            console.error('❌ Error getting previous tournaments:', error);
            return [];
        }
    }
}

