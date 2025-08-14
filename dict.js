const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const axios = require("axios");
const { Readable } = require('stream');

// --- A compact logger for formatted output ---
class Logger {
    constructor(title) {
        this.title = title;
        this.width = 80;
        this.hasError = false;
        this.output = [];
    }

    start() {
        const date = new Date().toISOString().slice(0, 10);
        const header = `--- ${this.title} | ${date} ---`;
        this.output.push('='.repeat(this.width));
        this.output.push(header);
        this.output.push('-'.repeat(this.width));
    }

    step(name) {
        this.output.push(`\n[ ${name} ]`);
    }

    info(message) {
        this.output.push(`  • ${message}`);
    }
    
    success(message) {
        this.output.push(`  ✔ ${message}`);
    }

    warn(message) {
        this.output.push(`  ⚠ ${message}`);
    }

    error(message) {
        this.hasError = true;
        this.output.push(`  ✖ ERROR: ${message}`);
    }

    summary(message) {
        this.output.push(`  -> ${message}`);
    }

    end() {
        this.output.push('-'.repeat(this.width));
        const status = this.hasError ? 'Run failed' : 'Run finished successfully';
        this.output.push(status);
        this.output.push('='.repeat(this.width));
        console.log(this.output.join('\n'));
    }
}


// --- CONFIG ---
const CSV_PATH = "code_dict.csv";
const FPL_API_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";

// --- Helper: Get current FPL season ---
function getCurrentSeason() {
  const now = new Date();
  let year = now.getFullYear();
  // FPL season starts in July
  if (now.getMonth() < 6) {
    // Jan-Jun: still in previous season's year
    year -= 1;
  }
  const nextYear = (year + 1).toString().slice(-2);
  return `${year}_${nextYear}`; // e.g., 2024_25
}

// --- Helper: Generate season column names ---
function getSeasonColumns(season) {
  return {
    fplId: `FPL_ID_${season.replace("_", "-")}`,
    team: `Team_${season.replace("_", "-")}`,
  };
}

// --- Helper: Read CSV as array of objects ---
function readCSV(path) {
  return new Promise((resolve, reject) => {
    const data = [];
    fs.createReadStream(path)
      .pipe(csv())
      .on("data", (row) => data.push(row))
      .on("end", () => resolve(data))
      .on("error", (err) => reject(err));
  });
}

// --- Helper: Write CSV ---
async function writeCSV(path, header, data) {
  const csvWriter = createCsvWriter({ path, header });
  await csvWriter.writeRecords(data);
}

// --- Main update function ---
async function updateDict(logger) {
  try {
    const response = await axios.get(FPL_API_URL);
    const elements = response.data.elements;
    const teams = response.data.teams;
    logger.success("Fetched FPL data from API.");

    // Build team code map from API
    const apiTeamCodes = {};
    teams.forEach((team) => {
      apiTeamCodes[team.code] = team.name;
    });

    // --- Persisted team codes (update if new found) ---
    let team_codes = {
      1: "Man Utd", 2: "Leeds", 3: "Arsenal", 4: "Newcastle", 6: "Spurs",
      8: "Chelsea", 7: "Aston Villa", 11: "Everton", 13: "Leicester", 14: "Liverpool",
      17: "Nott'm Forest", 20: "Southampton", 21: "West Ham", 31: "Crystal Palace",
      36: "Brighton", 39: "Wolves", 40: "Ipswich", 43: "Man City", 49: "Sheffield Utd",
      54: "Fulham", 56: "Sunderland", 90: "Burnley", 91: "Bournemouth", 94: "Brentford",
      102: "Luton",
    };
    // Add any new team codes from API
    let newTeams = 0;
    Object.entries(apiTeamCodes).forEach(([code, name]) => {
      if (!team_codes[code]) {
        team_codes[code] = name;
        newTeams++;
        logger.info(`New team found: ${code} = ${name}`);
      }
    });
    if (newTeams > 0) {
      logger.summary(`Added ${newTeams} new team(s) to team_codes.`);
    }

    // --- Read CSV ---
    let existingData = await readCSV(CSV_PATH);
    if (!existingData.length) {
      throw new Error("CSV is empty or missing header row.");
    }

    // --- Handle dynamic columns ---
    const currentSeason = getCurrentSeason();
    const { fplId, team } = getSeasonColumns(currentSeason);
    let headerKeys = Object.keys(existingData[0]);
    let header = headerKeys.map((k) => ({ id: k, title: k }));
    let addedColumns = false;
    if (!headerKeys.includes(fplId)) {
      header.push({ id: fplId, title: fplId });
      addedColumns = true;
    }
    if (!headerKeys.includes(team)) {
      header.push({ id: team, title: team });
      addedColumns = true;
    }
    if (addedColumns) {
      logger.info(`Added new columns for season ${currentSeason}: ${fplId}, ${team}`);
      existingData.forEach((row) => {
        if (!row[fplId]) row[fplId] = "";
        if (!row[team]) row[team] = "";
      });
    }

    // --- Update or add players ---
    let newPlayers = 0;
    let updatedPlayers = 0;
    elements.forEach((element) => {
      const { code, first_name, second_name, web_name, id, team_code, minutes } = element;
      const fplName = `${first_name} ${second_name}`;
      const teamName = team_codes[team_code] || apiTeamCodes[team_code] || "";
      let player = existingData.find((row) => row.Code === code.toString());
      if (player) {
        player.FPL_Name = fplName;
        player.Web_Name = web_name;
        player[fplId] = id;
        player[team] = teamName;
        updatedPlayers++;
        if (minutes > 0 && !player.Understat_ID) {
          logger.warn(`${fplName} (${web_name}, ${teamName}) has ${minutes} mins but no Understat_ID.`);
        }
      } else {
        const newRow = { Code: code, FPL_Name: fplName, Web_Name: web_name, Understat_ID: "", Understat_Name: "" };
        header.forEach((h) => { if (!(h.id in newRow)) newRow[h.id] = ""; });
        newRow[fplId] = id;
        newRow[team] = teamName;
        existingData.push(newRow);
        newPlayers++;
      }
    });

    // --- Write back to CSV ---
    await writeCSV(CSV_PATH, header, existingData);
    logger.summary(`CSV updated: ${updatedPlayers} players updated, ${newPlayers} new players added.`);

  } catch (err) {
    logger.error(`Error in FPL update: ${err.message}`);
    throw err; // re-throw to be caught in main
  }
}

// --- Helper: Parse CSV from string ---
function parseCsvFromString(csvString) {
  return new Promise((resolve, reject) => {
    const data = [];
    const stream = Readable.from(csvString);
    stream
      .pipe(csv())
      .on('data', (row) => data.push(row))
      .on('end', () => resolve(data))
      .on('error', (err) => reject(err));
  });
}

// --- New function to update Understat IDs ---
async function updateUnderstatIdsFromMasterCSV(logger) {
  const MASTER_CSV_URL = "https://raw.githubusercontent.com/ChrisMusson/FPL-ID-Map/refs/heads/main/Master.csv";

  try {
    const response = await axios.get(MASTER_CSV_URL);
    const masterCsvData = await parseCsvFromString(response.data);
    logger.success("Fetched Master CSV from GitHub.");

    const understatMap = new Map();
    masterCsvData.forEach(row => {
      if (row.code && row.understat) {
        understatMap.set(row.code, row.understat);
      }
    });

    let localData = await readCSV(CSV_PATH);
    const headerKeys = Object.keys(localData[0]);
    const header = headerKeys.map((k) => ({ id: k, title: k }));

    let updatedCount = 0;
    let mismatchedCount = 0;
    localData.forEach(player => {
      if (player.Code) {
        const understatId = understatMap.get(player.Code);
        if (player.Understat_ID && understatId && player.Understat_ID !== understatId) {
          logger.warn(`Mismatch ID for ${player.FPL_Name}. Local: ${player.Understat_ID}, Master: ${understatId}. Overwriting.`);
          player.Understat_ID = understatId;
          mismatchedCount++;
        }

        if (!player.Understat_ID && understatId) {
          player.Understat_ID = understatId;
          updatedCount++;
        }
      }
    });

    if (mismatchedCount > 0) {
      logger.summary(`${mismatchedCount} mismatched IDs found and updated from Master CSV.`);
    }
    if (updatedCount > 0) {
        logger.summary(`${updatedCount} new Understat IDs added from Master CSV.`);
    }

    if (updatedCount > 0 || mismatchedCount > 0) {
      await writeCSV(CSV_PATH, header, localData);
      logger.success("Understat ID update complete.");
    } else {
      logger.info("No new or mismatched Understat IDs found.");
    }

  } catch (error) {
    logger.error(`Error during Understat ID update: ${error.message}`);
    throw error; // re-throw to be caught in main
  }
}


// --- Main Execution ---
async function main() {
  const logger = new Logger("FPL & Understat Data Sync");
  logger.start();

  try {
    // --- CONFIG ---
    const UPDATE_UNDERSTAT_IDS = true; // Toggle this to enable/disable the new feature

    logger.step("FPL Player Data Update");
    await updateDict(logger);

    if (UPDATE_UNDERSTAT_IDS) {
      logger.step("Understat ID Sync");
      await updateUnderstatIdsFromMasterCSV(logger);
    }
  } catch (e) {
    // Errors are already logged, just ensures the script exits with an error code
    process.exitCode = 1;
  } finally {
    logger.end();
  }
}

main();