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
    let packetFilters = []; // Array of filters e.g., ['SKILL', 'ABNORMAL'] (case-insensitive check)
    let logFakePackets = false; // Default: Do not log packets sent by mods
    let logToGame = true; // Default: Log to in-game text
    let logToFile = true; // Default: Log to file
    const logDir = path.join(__dirname, 'logs');
    const logFileName = `packets_${Date.now()}.log`;
    const logFilePath = path.join(logDir, logFileName);

    // --- Initialization ---
    try {
        ensureDirectoryExistence(logFilePath);
        logStream = fs.createWriteStream(logFilePath, { flags: 'a' }); // Append mode
        mod.log(`Packet log file created: ${logFilePath}`);
    } catch (e) {
        mod.error('Failed to create log directory or file stream.');
        mod.error(e);
        // Mod can continue, but file logging will be disabled
    }

    // --- Packet Hook ---
    mod.hook('*', 'raw', { order: 10000 }, (code, data, incoming, fake) => { // Use high order to run after most other mods
        // Skip fake packets if logFakePackets is false
        if (fake && !logFakePackets) return;

        const timestamp = new Date().toISOString();
        const direction = incoming ? 'S->C' : 'C->S';
        const name = mod.dispatch.protocolMap.code.get(code) || 'UNKNOWN';

        // Apply filters
        if (packetFilters.length > 0) {
            // Check if any filter matches
            const nameUpper = name.toUpperCase();
            const matchesFilter = packetFilters.some(filter => nameUpper.includes(filter));
            if (!matchesFilter) {
                return; // Skip logging if filters are active and none match
            }
        }

        // Add [FAKE] prefix if logging fake packets
        const fakePrefix = fake ? '[FAKE] ' : '';

        // 1. In-Game Logging
        if (logToGame) {
            command.message(`${fakePrefix}${direction} | ${name} (${code})`);
        }

        // 2. File Logging
        if (logToFile && logStream) {
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

    // --- Command Definition ---
    command.add('pktlog', (filterArg) => {
        if (filterArg && filterArg.trim().length > 0) {
            const newFilter = filterArg.trim().toUpperCase();
            
            // Check if this filter is already in the list
            const filterIndex = packetFilters.indexOf(newFilter);
            
            if (filterIndex === -1) {
                // Add new filter
                packetFilters.push(newFilter);
                command.message(`Added packet filter: ${newFilter}`);
            } else {
                // Remove existing filter
                packetFilters.splice(filterIndex, 1);
                command.message(`Removed packet filter: ${newFilter}`);
            }
            
            // Show current filters
            if (packetFilters.length > 0) {
                command.message(`Current packet filters: ${packetFilters.join(', ')}`);
            } else {
                command.message('All packet filters removed.');
            }
        } else {
            // Clear all filters
            packetFilters = [];
            command.message('All packet filters removed.');
        }
    });

    command.add('pktlogfake', () => {
        logFakePackets = !logFakePackets;
        command.message(`Logging of fake packets ${logFakePackets ? 'enabled' : 'disabled'}.`);
    });
    
    command.add('pktloggame', () => {
        logToGame = !logToGame;
        command.message(`Logging to in-game text ${logToGame ? 'enabled' : 'disabled'}.`);
    });
    
    command.add('pktlogfile', () => {
        logToFile = !logToFile;
        command.message(`Logging to file ${logToFile ? 'enabled' : 'disabled'}.`);
    });

    // --- Cleanup ---
    this.destructor = () => {
        if (logStream) {
            logStream.end();
            mod.log('Packet log stream closed.');
        }
        command.remove('pktlog');
        command.remove('pktlogfake');
        command.remove('pktloggame');
        command.remove('pktlogfile');
    };
};