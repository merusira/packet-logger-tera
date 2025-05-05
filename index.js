'use strict';

const fs = require('fs');
const path = require('path');

// Helper to ensure log directory exists
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

// Replacer function to handle BigInt serialization for JSON.stringify
function bigIntReplacer(key, value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
}

module.exports = function PacketLogger(mod) {
    const command = mod.require ? mod.require.command : mod.command; // Handle legacy/core mod loading
    let logStream = null;
    
    // Reference settings directly instead of destructuring to ensure we always use the latest values
    
    // Helper function for debug logging
    function debugLog(message) {
        if (mod.settings.debug) {
            mod.log(message);
        }
    }
    
    const logDir = path.join(__dirname, 'logs');
    const logFileName = `packets_${Date.now()}.log`;
    const logFilePath = path.join(logDir, logFileName);
    
    // Create a separate log file for item and skill usage
    const itemSkillLogFileName = `item_skill_log_${Date.now()}.log`;
    const itemSkillLogFilePath = path.join(logDir, itemSkillLogFileName);
    let itemSkillLogStream = null;

    // --- Initialization ---
    try {
        ensureDirectoryExistence(logFilePath);
        logStream = fs.createWriteStream(logFilePath, { flags: 'a' }); // Append mode
        itemSkillLogStream = fs.createWriteStream(itemSkillLogFilePath, { flags: 'a' }); // Append mode
        mod.log(`Packet log file created: ${logFilePath}`);
        mod.log(`Item/Skill log file created: ${itemSkillLogFilePath}`);
    } catch (e) {
        mod.error('Failed to create log directory or file stream.');
        mod.error(e);
        // Mod can continue, but file logging will be disabled
    }

    // --- Packet Hook ---
    mod.hook('*', 'raw', { order: 10000 }, (code, data, incoming, fake) => { // Use high order to run after most other mods
        // Skip fake packets if logFakePackets is false
        if (fake && !mod.settings.logFakePackets) return;

        const timestamp = new Date().toISOString();
        const direction = incoming ? 'S->C' : 'C->S';
        const name = mod.dispatch.protocolMap.code.get(code) || 'UNKNOWN';

        // Apply filters
        if (mod.settings.packetFilters.length > 0) {
            // Check if any filter matches
            const nameUpper = name.toUpperCase();
            const matchesFilter = mod.settings.packetFilters.some(filter => nameUpper.includes(filter));
            if (!matchesFilter) {
                return; // Skip logging if filters are active and none match
            }
        }

        // Add [FAKE] prefix if logging fake packets
        const fakePrefix = fake ? '[FAKE] ' : '';

        // 1. In-Game Logging
        if (mod.settings.logPktToGame) {
            command.message(`${fakePrefix}${direction} | ${name} (${code})`);
        }

        // 2. File Logging
        if (mod.settings.logPktToFile && logStream) {
            let logLine = `${timestamp} | ${fakePrefix}${direction} | ${code} | ${name}`;
            let event = null;

            if (name !== 'UNKNOWN') {
                try {
                    // Try to parse with the latest known definition
                    const latestVersion = mod.dispatch.latestDefVersion.get(name);
                    if (latestVersion !== undefined) {
                        event = mod.dispatch.fromRaw(name, latestVersion, data);
                    }
                } catch (e) {
                    // Parsing failed, log raw data instead
                    event = null;
                    // mod.warn(`Failed to parse ${name} (${code}): ${e.message}`); // Optional: Log parsing errors
                }
            }

            if (event) {
                // Safely stringify, handling potential circular references or large objects and BigInts
                try {
                    logLine += ` | ${JSON.stringify(event, bigIntReplacer)}`;
                } catch (stringifyError) {
                     logLine += ` | PARSED (Stringify Error: ${stringifyError.message})`;
                }
            } else {
                logLine += ` | RAW: ${data.toString('hex')}`;
            }

            logStream.write(logLine + '\n');
        }
    });
// Item Usage
mod.hook('C_USE_ITEM', 3, { order: 1000, filter: { fake: null } }, event => {
    // Log that we received an item use packet for debugging
    const fakeStatus = event.fake ? 'FAKE' : 'REAL';
    debugLog(`Received ${fakeStatus} C_USE_ITEM packet: ${JSON.stringify(event, bigIntReplacer)}`);
    
        
        if (mod.settings.logItemSkillToGame || mod.settings.logItemSkillToFile) {
            // Get item name if possible
            let itemName = "Unknown Item";
            try {
                // Try to get item data from game state
                if (mod.game.data && mod.game.data.items) {
                    const item = mod.game.data.items.get(event.id);
                    if (item && item.name) {
                        itemName = item.name;
                    }
                }
            } catch (e) {
                mod.warn(`Failed to get item name for ID ${event.id}: ${e.message}`);
            }

            // Log to game chat
            if (mod.settings.logItemSkillToGame) {
                try {
                    debugLog(`Attempting to log ${fakeStatus} item to chat: ${itemName} (ID: ${event.id})`);
                    command.message(`${fakeStatus} C_USE_ITEM: ${itemName} (ID: ${event.id})`);
                    debugLog('Successfully logged item to chat');
                } catch (e) {
                    mod.error(`Failed to log item to chat: ${e.message}`);
                }
            }
            
            // Log to file
            if (mod.settings.logItemSkillToFile && itemSkillLogStream) {
                const timestamp = new Date().toISOString();
                itemSkillLogStream.write(`${timestamp} | C_USE_ITEM | ID: ${event.id} | Name: ${itemName}\n`);
            }
        }
        return true;
    });

    // Skill Usage - Use high order to ensure it runs after other mods
    mod.hook('C_START_SKILL', 7, { order: 1000, filter: { fake: null } }, event => {
        // Log that we received a skill packet for debugging
        const fakeStatus = event.fake ? 'FAKE' : 'REAL';
        debugLog(`Received ${fakeStatus} C_START_SKILL packet: ${JSON.stringify(event, bigIntReplacer)}`);
        
        if (mod.settings.logItemSkillToGame || mod.settings.logItemSkillToFile) {
            // Parse skill ID to get base skill
            const skillId = event.skill.id;
            const skillBaseId = Math.floor((skillId - 0x4000000) / 10000);
            
            // Get skill name if possible
            let skillName = "Unknown Skill";
            try {
                // Try to get skill name from system message
                // This is a simplified approach - in a full implementation, you might want to 
                // query skill data from the game client or use a predefined mapping
                skillName = `Skill ${skillBaseId}`;
            } catch (e) {
                mod.warn(`Failed to get skill name for ID ${skillId}: ${e.message}`);
            }

            // Log to game chat
            if (mod.settings.logItemSkillToGame) {
                try {
                    debugLog(`Attempting to log ${fakeStatus} skill to chat: ${skillName} (ID: ${skillId})`);
                    command.message(`${fakeStatus} C_START_SKILL: ${skillName} (ID: ${skillId})`);
                    debugLog('Successfully logged skill to chat');
                } catch (e) {
                    mod.error(`Failed to log skill to chat: ${e.message}`);
                }
            }
            
            // Log to file
            if (mod.settings.logItemSkillToFile && itemSkillLogStream) {
                const timestamp = new Date().toISOString();
                itemSkillLogStream.write(`${timestamp} | C_START_SKILL | ID: ${skillId} | Base ID: ${skillBaseId} | Name: ${skillName}\n`);
            }
        }
        return true;
    });
    
    // Additional Skill Usage Hook - for press-type skills
    mod.hook('C_PRESS_SKILL', 4, { order: 1000, filter: { fake: null } }, event => {
        // Log that we received a press skill packet for debugging
        const fakeStatus = event.fake ? 'FAKE' : 'REAL';
        debugLog(`Received ${fakeStatus} C_PRESS_SKILL packet: ${JSON.stringify(event, bigIntReplacer)}`);
        
        if (mod.settings.logItemSkillToGame || mod.settings.logItemSkillToFile) {
            // Parse skill ID to get base skill
            const skillId = event.skill.id;
            const skillBaseId = Math.floor((skillId - 0x4000000) / 10000);
            
            // Get skill name if possible
            let skillName = "Unknown Press Skill";
            try {
                skillName = `Press Skill ${skillBaseId}`;
            } catch (e) {
                mod.warn(`Failed to get skill name for ID ${skillId}: ${e.message}`);
            }

            // Log to game chat
            if (mod.settings.logItemSkillToGame) {
                try {
                    debugLog(`Attempting to log ${fakeStatus} press skill to chat: ${skillName} (ID: ${skillId})`);
                    command.message(`${fakeStatus} C_PRESS_SKILL: ${skillName} (ID: ${skillId})`);
                    debugLog('Successfully logged press skill to chat');
                } catch (e) {
                    mod.error(`Failed to log press skill to chat: ${e.message}`);
                }
            }
            
            // Log to file
            if (mod.settings.logItemSkillToFile && itemSkillLogStream) {
                const timestamp = new Date().toISOString();
                itemSkillLogStream.write(`${timestamp} | C_PRESS_SKILL | ID: ${skillId} | Base ID: ${skillBaseId} | Name: ${skillName}\n`);
            }
        }
        return true;
    });
    
    // Additional Skill Usage Hook - for targeted skills
    mod.hook('C_START_TARGETED_SKILL', 7, { order: 1000, filter: { fake: null } }, event => {
        // Log that we received a targeted skill packet for debugging
        const fakeStatus = event.fake ? 'FAKE' : 'REAL';
        debugLog(`Received ${fakeStatus} C_START_TARGETED_SKILL packet: ${JSON.stringify(event, bigIntReplacer)}`);
        
        if (mod.settings.logItemSkillToGame || mod.settings.logItemSkillToFile) {
            // Parse skill ID to get base skill
            const skillId = event.skill.id;
            const skillBaseId = Math.floor((skillId - 0x4000000) / 10000);
            
            // Get skill name if possible
            let skillName = "Unknown Targeted Skill";
            try {
                skillName = `Targeted Skill ${skillBaseId}`;
            } catch (e) {
                mod.warn(`Failed to get skill name for ID ${skillId}: ${e.message}`);
            }

            // Log to game chat
            if (mod.settings.logItemSkillToGame) {
                try {
                    debugLog(`Attempting to log ${fakeStatus} targeted skill to chat: ${skillName} (ID: ${skillId})`);
                    command.message(`${fakeStatus} C_START_TARGETED_SKILL: ${skillName} (ID: ${skillId})`);
                    debugLog('Successfully logged targeted skill to chat');
                } catch (e) {
                    mod.error(`Failed to log targeted skill to chat: ${e.message}`);
                }
            }
            
            // Log to file
            if (mod.settings.logItemSkillToFile && itemSkillLogStream) {
                const timestamp = new Date().toISOString();
                itemSkillLogStream.write(`${timestamp} | C_START_TARGETED_SKILL | ID: ${skillId} | Base ID: ${skillBaseId} | Name: ${skillName}\n`);
            }
        }
        return true;
    });
    
    // Additional Skill Usage Hook - for combo instant skills
    mod.hook('C_START_COMBO_INSTANT_SKILL', 6, { order: 1000, filter: { fake: null } }, event => {
        // Log that we received a combo instant skill packet for debugging
        const fakeStatus = event.fake ? 'FAKE' : 'REAL';
        debugLog(`Received ${fakeStatus} C_START_COMBO_INSTANT_SKILL packet: ${JSON.stringify(event, bigIntReplacer)}`);
        
        if (mod.settings.logItemSkillToGame || mod.settings.logItemSkillToFile) {
            // Parse skill ID to get base skill
            const skillId = event.skill.id;
            const skillBaseId = Math.floor((skillId - 0x4000000) / 10000);
            
            // Get skill name if possible
            let skillName = "Unknown Combo Skill";
            try {
                skillName = `Combo Skill ${skillBaseId}`;
            } catch (e) {
                mod.warn(`Failed to get skill name for ID ${skillId}: ${e.message}`);
            }

            // Log to game chat
            if (mod.settings.logItemSkillToGame) {
                try {
                    debugLog(`Attempting to log ${fakeStatus} combo skill to chat: ${skillName} (ID: ${skillId})`);
                    command.message(`${fakeStatus} C_START_COMBO_INSTANT_SKILL: ${skillName} (ID: ${skillId})`);
                    debugLog('Successfully logged combo skill to chat');
                } catch (e) {
                    mod.error(`Failed to log combo skill to chat: ${e.message}`);
                }
            }
            
            // Log to file
            if (mod.settings.logItemSkillToFile && itemSkillLogStream) {
                const timestamp = new Date().toISOString();
                itemSkillLogStream.write(`${timestamp} | C_START_COMBO_INSTANT_SKILL | ID: ${skillId} | Base ID: ${skillBaseId} | Name: ${skillName}\n`);
            }
        }
        return true;
    });
    
    // Additional Skill Usage Hook - for no-timeline skills
    mod.hook('C_NOTIMELINE_SKILL', 3, { order: 1000, filter: { fake: null } }, event => {
        // Log that we received a no-timeline skill packet for debugging
        const fakeStatus = event.fake ? 'FAKE' : 'REAL';
        debugLog(`Received ${fakeStatus} C_NOTIMELINE_SKILL packet: ${JSON.stringify(event, bigIntReplacer)}`);
        
        if (mod.settings.logItemSkillToGame || mod.settings.logItemSkillToFile) {
            // Parse skill ID to get base skill
            const skillId = event.skill.id;
            const skillBaseId = Math.floor((skillId - 0x4000000) / 10000);
            
            // Get skill name if possible
            let skillName = "Unknown NoTimeline Skill";
            try {
                skillName = `NoTimeline Skill ${skillBaseId}`;
            } catch (e) {
                mod.warn(`Failed to get skill name for ID ${skillId}: ${e.message}`);
            }

            // Log to game chat
            if (mod.settings.logItemSkillToGame) {
                try {
                    debugLog(`Attempting to log ${fakeStatus} no-timeline skill to chat: ${skillName} (ID: ${skillId})`);
                    command.message(`${fakeStatus} C_NOTIMELINE_SKILL: ${skillName} (ID: ${skillId})`);
                    debugLog('Successfully logged no-timeline skill to chat');
                } catch (e) {
                    mod.error(`Failed to log no-timeline skill to chat: ${e.message}`);
                }
            }
            
            // Log to file
            if (mod.settings.logItemSkillToFile && itemSkillLogStream) {
                const timestamp = new Date().toISOString();
                itemSkillLogStream.write(`${timestamp} | C_NOTIMELINE_SKILL | ID: ${skillId} | Base ID: ${skillBaseId} | Name: ${skillName}\n`);
            }
        }
        return true;
    });

    // --- Command Definition ---
    command.add('pktlog', (filterArg) => {
        if (filterArg && filterArg.trim().length > 0) {
            const newFilter = filterArg.trim().toUpperCase();
            
            // Check if this filter is already in the list
            const filterIndex = mod.settings.packetFilters.indexOf(newFilter);
            
            if (filterIndex === -1) {
                // Add new filter
                mod.settings.packetFilters.push(newFilter);
                command.message(`Added packet filter: ${newFilter}`);
            } else {
                // Remove existing filter
                mod.settings.packetFilters.splice(filterIndex, 1);
                command.message(`Removed packet filter: ${newFilter}`);
            }
            
            // Show current filters
            if (mod.settings.packetFilters.length > 0) {
                command.message(`Current packet filters: ${mod.settings.packetFilters.join(', ')}`);
            } else {
                command.message('All packet filters removed.');
            }
        } else {
            // Clear all filters
            mod.settings.packetFilters = [];
            command.message('All packet filters removed.');
        }
    });

    command.add('pktlogfake', () => {
        mod.settings.logFakePackets = !mod.settings.logFakePackets;
        command.message(`Logging of fake packets ${mod.settings.logFakePackets ? 'enabled' : 'disabled'}.`);
    });
    
    command.add('pktloggame', () => {
        mod.settings.logPktToGame = !mod.settings.logPktToGame;
        command.message(`Logging packets to in-game text ${mod.settings.logPktToGame ? 'enabled' : 'disabled'}.`);
    });
    
    command.add('pktlogfile', () => {
        mod.settings.logPktToFile = !mod.settings.logPktToFile;
        command.message(`Logging packets to file ${mod.settings.logPktToFile ? 'enabled' : 'disabled'}.`);
    });

    command.add('itemskillgame', () => {
        mod.settings.logItemSkillToGame = !mod.settings.logItemSkillToGame;
        command.message(`Logging item/skill to in-game text ${mod.settings.logItemSkillToGame ? 'enabled' : 'disabled'}.`);
    });
    
    command.add('itemskillfile', () => {
        mod.settings.logItemSkillToFile = !mod.settings.logItemSkillToFile;
        command.message(`Logging item/skill to file ${mod.settings.logItemSkillToFile ? 'enabled' : 'disabled'}.`);
    });
    
    command.add('pktdebug', () => {
        mod.settings.debug = !mod.settings.debug;
        command.message(`Debug logging ${mod.settings.debug ? 'enabled' : 'disabled'}.`);
    });

    // --- Cleanup ---
    this.destructor = () => {
        if (logStream) {
            logStream.end();
            mod.log('Packet log stream closed.');
        }
        if (itemSkillLogStream) {
            itemSkillLogStream.end();
            mod.log('Item/Skill log stream closed.');
        }
        command.remove('pktlog');
        command.remove('pktlogfake');
        command.remove('pktloggame');
        command.remove('pktlogfile');
        command.remove('itemskillgame');
        command.remove('itemskillfile');
        command.remove('pktdebug');
        command.remove('pktdebug');
    };
};