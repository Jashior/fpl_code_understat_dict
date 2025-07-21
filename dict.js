const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const axios = require("axios");

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
async function updateDict() {
  try {
    console.log("Fetching FPL data from API...");
    const response = await axios.get(FPL_API_URL);
    const elements = response.data.elements;
    const teams = response.data.teams;
    console.log("FPL data fetched.");

    // Build team code map from API
    const apiTeamCodes = {};
    teams.forEach((team) => {
      apiTeamCodes[team.code] = team.name;
    });

    // --- Persisted team codes (update if new found) ---
    let team_codes = {
      1: "Man Utd",
      2: "Leeds",
      3: "Arsenal",
      4: "Newcastle",
      6: "Spurs",
      8: "Chelsea",
      7: "Aston Villa",
      11: "Everton",
      13: "Leicester",
      14: "Liverpool",
      17: "Nott'm Forest",
      20: "Southampton",
      21: "West Ham",
      31: "Crystal Palace",
      36: "Brighton",
      39: "Wolves",
      40: "Ipswich",
      43: "Man City",
      49: "Sheffield Utd",
      54: "Fulham",
      56: "Sunderland",
      90: "Burnley",
      91: "Bournemouth",
      94: "Brentford",
      102: "Luton",
    };
    // Add any new team codes from API
    let newTeams = 0;
    Object.entries(apiTeamCodes).forEach(([code, name]) => {
      if (!team_codes[code]) {
        team_codes[code] = name;
        newTeams++;
        console.log(`New team code found: ${code} = ${name}`);
      }
    });
    if (newTeams > 0) {
      console.log(`Added ${newTeams} new team(s) to team_codes.`);
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
      existingData.forEach((row) => (row[fplId] = ""));
    }
    if (!headerKeys.includes(team)) {
      header.push({ id: team, title: team });
      addedColumns = true;
      existingData.forEach((row) => (row[team] = ""));
    }
    if (addedColumns) {
      console.log(
        `Added new columns for season ${currentSeason}: ${fplId}, ${team}`
      );
    }

    // --- Update or add players ---
    let newPlayers = 0;
    let updatedPlayers = 0;
    elements.forEach((element) => {
      const {
        code,
        first_name,
        second_name,
        web_name,
        id,
        team_code,
        minutes,
      } = element;
      const fplName = `${first_name} ${second_name}`;
      const teamName = team_codes[team_code] || apiTeamCodes[team_code] || "";
      let player = existingData.find((row) => row.Code === code.toString());
      if (player) {
        // Update player for current season
        player.FPL_Name = fplName;
        player.Web_Name = web_name;
        player[fplId] = id;
        player[team] = teamName;
        updatedPlayers++;
        // Warn if no Understat_ID and played minutes
        if (minutes > 0 && !player.Understat_ID) {
          console.warn(
            `Player ${fplName} (${web_name}, ${teamName}) has >0 minutes but no Understat_ID (${minutes} mins).`
          );
        }
      } else {
        // Add new player
        const newRow = {
          Code: code,
          FPL_Name: fplName,
          Web_Name: web_name,
          Understat_ID: "",
          Understat_Name: "",
        };
        // Fill all season columns as blank except current
        header.forEach((h) => {
          if (!(h.id in newRow)) newRow[h.id] = "";
        });
        newRow[fplId] = id;
        newRow[team] = teamName;
        existingData.push(newRow);
        newPlayers++;
        console.log(
          `Added new player: ${fplName} (${web_name}, ${teamName}) (${minutes} mins).`
        );
      }
    });

    // --- Write back to CSV ---
    await writeCSV(CSV_PATH, header, existingData);
    console.log(
      `CSV updated. ${updatedPlayers} players updated, ${newPlayers} new players added.`
    );
  } catch (err) {
    console.error("Error updating dict:", err.message);
    process.exit(1);
  }
}

// --- Run ---
updateDict();
