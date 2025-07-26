export class WordleAnalyzer {
    constructor() {
        this.wordlePattern = /Wordle\s+(\d{1,4}(?:,\d{3})*)\s+([1-6X])\/6/i;
        
        // Better emoji pattern that handles Unicode properly
        this.emojiPattern = /(\u2B1B|\u2B1C|\uD83D\uDFE8|\uD83D\uDFE9|\uD83D\uDFE6)/g;
        
        // Alternative: Use a more comprehensive pattern
        this.wordleEmojiPattern = /(⬛|⬜|🟨|🟩|🟦)/gu;
        
        // Scoring system
        this.baseScores = {
            1: 600,
            2: 500,
            3: 400,
            4: 300,
            5: 200,
            6: 100,
            'X': 0
        };
        
        this.emojiPoints = {
            '🟩': 2,  // Green
            '🟨': 1,  // Yellow
            '⬛': 0,  // Black
            '⬜': 0,  // White
            '🟦': 0   // Blue (sometimes used)
        };
    }

    /**
     * Check if a message contains a Wordle result
     */
    isWordleResult(text) {
        return this.wordlePattern.test(text) && this.wordleEmojiPattern.test(text);
    }

    /**
     * Extract emojis from a line using proper Unicode handling
     */
    extractEmojisFromLine(line) {
        console.log('     🔍 Extracting from line:', JSON.stringify(line));
        console.log('     🔍 Line length:', line.length);
        console.log('     🔍 Line chars:', [...line].map(c => `${c} (${c.codePointAt(0)})`));
        
        // Test different patterns
        const pattern1 = /(⬛|⬜|🟨|🟩|🟦)/gu;
        const pattern2 = /[\u2B1B\u2B1C\uD83D\uDFE8\uD83D\uDFE9\uD83D\uDFE6]/g;
        const pattern3 = /(\u2B1B|\u2B1C|\uD83D\uDFE8|\uD83D\uDFE9|\uD83D\uDFE6)/g;
        
        console.log('     🔍 Pattern1 test:', pattern1.test(line));
        pattern2.lastIndex = 0; // Reset regex
        console.log('     🔍 Pattern2 test:', pattern2.test(line));
        pattern3.lastIndex = 0; // Reset regex
        console.log('     🔍 Pattern3 test:', pattern3.test(line));
        
        // Reset the pattern and try matching
        this.wordleEmojiPattern.lastIndex = 0; // Reset regex
        const matches = [...line.matchAll(this.wordleEmojiPattern)];
        console.log('     🔍 Matches found:', matches.length);
        console.log('     🔍 Matches:', matches);
        
        return matches.map(match => match[0]);
    }

    /**
     * Parse Wordle result from message text
     */
    parseWordleResult(text) {
        console.log('   🔍 Parsing text:', JSON.stringify(text));
        
        const match = text.match(this.wordlePattern);
        console.log('   🔍 Header match:', match);
        
        if (!match) {
            console.log('   ❌ No header match found');
            return null;
        }

        const gameNumber = match[1].replace(/,/g, ''); // Remove commas from number
        const attemptsStr = match[2];
        const attempts = attemptsStr === 'X' ? 7 : parseInt(attemptsStr); // X means failed (7 for sorting)
        const solved = attemptsStr !== 'X';

        console.log('   📊 Parsed header - Game:', gameNumber, 'Attempts:', attemptsStr, 'Solved:', solved);

        // Extract emoji pattern
        const lines = text.split('\n');
        console.log('   📝 Split into lines:', lines.length);
        
        const patternLines = [];
        
        for (const line of lines) {
            const emojis = this.extractEmojisFromLine(line);
            console.log('   🔍 Line:', JSON.stringify(line), '-> Emojis:', emojis);
            
            if (emojis && emojis.length === 5) {
                patternLines.push(emojis.join(''));
                console.log('   ✅ Added pattern line:', emojis.join(''));
            }
        }

        console.log('   📊 Total pattern lines found:', patternLines.length);

        if (patternLines.length === 0) {
            console.log('   ❌ No valid pattern lines found');
            return null;
        }

        // Calculate score
        const score = this.calculateScore(attemptsStr, patternLines);
        console.log('   🏆 Calculated score:', score);

        const result = {
            gameNumber: parseInt(gameNumber),
            attempts: solved ? attempts : 6, // For stats, treat failed as 6 attempts
            actualAttempts: attemptsStr, // Keep original for scoring
            solved,
            pattern: patternLines,
            score: score,
            rawText: text
        };
        
        console.log('   ✅ Final parsed result:', result);
        return result;
    }

    /**
     * Calculate Wordle score based on attempts and emoji pattern
     */
    calculateScore(attemptsStr, pattern) {
        // Base score from number of attempts
        const baseScore = this.baseScores[attemptsStr] || 0;
        
        // Emoji points (used as tie-breaker)
        let emojiPoints = 0;
        for (const line of pattern) {
            // Split the line properly to handle Unicode
            const emojis = [...line];
            for (const emoji of emojis) {
                emojiPoints += this.emojiPoints[emoji] || 0;
            }
        }
        
        return {
            baseScore,
            emojiPoints,
            totalScore: baseScore + emojiPoints
        };
    }

    /**
     * Analyze the Wordle pattern and provide insights
     */
    analyzePattern(pattern, score) {
        if (!pattern || pattern.length === 0) return 'No pattern to analyze';

        const insights = [];
        
        // Add score information only
        if (score) {
            insights.push(`🏆 Score: ${score.totalScore} points (${score.baseScore} base + ${score.emojiPoints} emoji)`);
        }
        
        return insights.join(' ');
    }

    /**
     * Count green and yellow hits in a guess
     */
    countHits(guess) {
        const green = (guess.match(/🟩/g) || []).length;
        const yellow = (guess.match(/🟨/g) || []).length;
        return { green, yellow };
    }

    /**
     * Analyze improvement between guesses
     */
    analyzeImprovement(pattern) {
        const improvements = [];
        
        for (let i = 1; i < pattern.length; i++) {
            const prev = this.countHits(pattern[i - 1]);
            const curr = this.countHits(pattern[i]);
            
            const greenGain = curr.green - prev.green;
            const totalGain = (curr.green + curr.yellow) - (prev.green + prev.yellow);
            
            if (greenGain > 0) {
                improvements.push(`📈 Great progress in attempt ${i + 1}!`);
                break; // Only comment on first major improvement
            } else if (totalGain > 0) {
                improvements.push(`🔄 Good letter discovery in attempt ${i + 1}!`);
                break;
            }
        }
        
        return improvements.join(' ');
    }

    /**
     * Assess the difficulty of the solve
     */
    assessDifficulty(pattern) {
        const attempts = pattern.length;
        
        if (attempts <= 2) {
            return '🔥 Incredible solve! Lightning fast!';
        } else if (attempts === 3) {
            return '⚡ Excellent solve! Very impressive!';
        } else if (attempts === 4) {
            return '👍 Solid solve! Well done!';
        } else if (attempts === 5) {
            return '😅 Close call, but you got it!';
        } else if (attempts === 6) {
            return '😰 Phew! That was a nail-biter!';
        }
        
        return '🎯 Nice solve!';
    }

    /**
     * Get statistics for a player's results
     */
    getPlayerStats(results) {
        if (!results || results.length === 0) {
            return {
                totalGames: 0,
                solvedGames: 0,
                solveRate: 0,
                averageAttempts: 0,
                averageScore: 0,
                totalScore: 0,
                distribution: {}
            };
        }

        const solved = results.filter(r => r.solved);
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 'X': 0 };
        let totalScore = 0;
        
        results.forEach(result => {
            if (result.solved) {
                distribution[result.attempts]++;
            } else {
                distribution['X']++;
            }
            
            if (result.score) {
                totalScore += result.score.totalScore;
            }
        });

        return {
            totalGames: results.length,
            solvedGames: solved.length,
            solveRate: (solved.length / results.length) * 100,
            averageAttempts: solved.length > 0 ? 
                solved.reduce((sum, r) => sum + r.attempts, 0) / solved.length : 0,
            averageScore: results.length > 0 ? totalScore / results.length : 0,
            totalScore,
            distribution
        };
    }

    /**
     * Generate leaderboard for a specific game number
     */
    generateGameLeaderboard(gameResults) {
        if (!gameResults || gameResults.length === 0) {
            return 'No results for this game yet!';
        }

        // Sort by total score (descending)
        const sortedResults = gameResults.sort((a, b) => {
            if (b.score.totalScore !== a.score.totalScore) {
                return b.score.totalScore - a.score.totalScore;
            }
            // If total scores are equal, sort by base score (fewer attempts wins)
            return b.score.baseScore - a.score.baseScore;
        });

        let leaderboard = `🏆 *Wordle ${gameResults[0].gameNumber} Leaderboard*\n\n`;
        
        sortedResults.forEach((result, index) => {
            const rank = index + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
            const attempts = result.solved ? `${result.attempts}/6` : 'X/6';
            
            leaderboard += `${medal} *${result.player}*\n`;
            leaderboard += `   ${attempts} - ${result.score.totalScore} points\n`;
            leaderboard += `   (${result.score.baseScore} base + ${result.score.emojiPoints} emoji)\n\n`;
        });

        return leaderboard;
    }

    /**
     * Generate a visual distribution chart
     */
    generateDistributionChart(distribution) {
        let chart = '📊 *Attempt Distribution:*\n';
        const maxCount = Math.max(...Object.values(distribution));
        
        for (let i = 1; i <= 6; i++) {
            const count = distribution[i] || 0;
            const percentage = maxCount > 0 ? (count / maxCount) : 0;
            const bars = '█'.repeat(Math.round(percentage * 10));
            chart += `${i}: ${bars} ${count}\n`;
        }
        
        if (distribution['X'] > 0) {
            const count = distribution['X'];
            const percentage = maxCount > 0 ? (count / maxCount) : 0;
            const bars = '█'.repeat(Math.round(percentage * 10));
            chart += `X: ${bars} ${count}\n`;
        }
        
        return chart;
    }
}