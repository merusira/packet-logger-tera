# Packet Logger Mod for TeraAtlas

This mod intercepts and logs all network packets between the TERA client and server.
Uses info from current toolbox / patch version to parse data from packets into the log file.

## Features

*   **In-Game Logging:** Prints basic packet information (Direction, Name, Opcode) to the private Toolbox chat channel (`/8`).
*   **File Logging:** Creates a detailed, timestamped log file for each session in the `mods/packet-logger/logs/` directory. Logs include timestamp, direction, opcode, name, and either parsed packet data (if known) or raw hexadecimal data.
*   **Filtering:** Allows filtering logged packets based on their name, with support for multiple filters simultaneously.
*   **Configurable Output:** Ability to toggle logging to in-game text and/or log file independently.
*   **Item and Skill Logging:** Logs item and skill usage with both IDs and names to game chat and/or log file.
*   **Real/Fake Packet Identification:** Clearly identifies whether packets are real (from the game) or fake (from mods).
*   **Debug Mode:** Optional debug logging for troubleshooting, which can be toggled on/off.

## Commands

Commands are entered in the Toolbox private chat channel (usually accessed with `/8` in game).

*   **`pktlog <filter_text>`**: Toggles a packet filter. If the filter doesn't exist, it adds it. If it already exists, it removes it.
    *   Example: `/8 pktlog SKILL` - Adds a filter for packets with "SKILL" in their name.
    *   Example: `/8 pktlog ABNORMALITY` - Adds another filter for abnormality-related packets.
    *   Running the same command again removes that specific filter.
*   **`pktlog`**: Removes all packet filters. All packets will be logged.
*   **`pktlogfake`**: Toggles the logging of "fake" packets (packets sent by mods themselves). By default, fake packets are *not* logged. When enabled, fake packets will have a `[FAKE]` prefix in the logs.
*   **`pktloggame`**: Toggles logging packets to in-game text.
*   **`pktlogfile`**: Toggles logging packets to the log file.
*   **`itemskillgame`**: Toggles logging item and skill usage to in-game text. When enabled, displays item/skill names and IDs when used.
*   **`itemskillfile`**: Toggles logging item and skill usage to a separate log file.
*   **`pktdebug`**: Toggles debug mode on/off. When enabled, detailed debug information is logged to the console.

## Log File Location

Log files are saved in: `[TeraAtlas Directory]/mods/packet-logger/logs/`

Each packet log file is named with a timestamp corresponding to when the session started, e.g., `packets_1744764281000.log`.

Item and skill usage logs are saved in a separate file with a similar naming convention: `item_skill_log_1744764281000.log`.

## Item and Skill Logging

When enabled, this mod will:
* Display item and skill usage in game chat with both name and ID
* Clearly indicate whether packets are REAL (from the game) or FAKE (from mods)
* Log item and skill usage to a separate log file with timestamp, ID, and name information
* For items, it attempts to retrieve the actual item name from the game data
* For skills, it displays the skill ID and base skill ID

## Credits

Written by merusira.

## FIN