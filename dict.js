const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const axios = require("axios");

console.log("Fetching JSON data...");
// Fetch JSON data from the URL
axios
  .get("https://fantasy.premierleague.com/api/bootstrap-static/")
  .then((response) => {
    console.log("JSON data fetched successfully.");
    const jsonData = response.data;
    const elements = jsonData.elements;

    // Read existing CSV data
    const existingData = [];
    fs.createReadStream("code_dict.csv")
      .pipe(csv())
      .on("data", (row) => {
        existingData.push(row);
      })
      .on("end", () => {
        console.log("CSV data read successfully.");

        // Add missing columns to the header
        const header = [
          { id: "Code", title: "Code" },
          { id: "FPL_Name", title: "FPL_Name" },
          { id: "Web_Name", title: "Web_Name" },
          { id: "Understat_ID", title: "Understat_ID" },
          { id: "Understat_Name", title: "Understat_Name" },
          { id: "FPL_ID_2023_24", title: "FPL_ID_2023-24" },
          { id: "Team_2023_24", title: "Team_2023-24" },
        ];

        // Process each element
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
          const teamName = team_codes[team_code] || ""; // Get the team name or use an empty string

          // Find the matching player in existingData
          const existingPlayer = existingData.find(
            (row) => row.Code === code.toString()
          );

          if (existingPlayer) {
            // Update existing player's data
            existingPlayer.FPL_Name = fplName;
            existingPlayer.Web_Name = web_name;
            existingPlayer.FPL_ID_2023_24 = id;
            existingPlayer.Team_2023_24 = teamName;

            // Check if the player has over 0 minutes and no Understat_ID
            if (minutes > 0 && !existingPlayer.Understat_ID) {
              console.log(
                `Player ${fplName} (${web_name}, ${teamName}) has over 0 minutes but no Understat_ID (${minutes} mins).`
              );
            }
          } else {
            // Check if the player code already exists in the CSV
            const playerExistsInCSV = existingData.some(
              (row) => row.Code === code.toString()
            );

            if (!playerExistsInCSV) {
              // Add new player's data
              const newData = {
                Code: code,
                FPL_Name: fplName,
                Web_Name: web_name,
                Understat_ID: "",
                Understat_Name: "",
                FPL_ID_2023_24: id,
                Team_2023_24: teamName,
              };
              console.log(
                `New data: ${JSON.stringify(newData)} (${minutes} mins).`
              );
              existingData.push(newData);
            }
          }
        });

        // Write updated data back to CSV
        const csvWriter = createCsvWriter({
          path: "code_dict.csv",
          header: header,
        });

        csvWriter
          .writeRecords(existingData)
          .then(() => {
            console.log("CSV file updated successfully.");
          })
          .catch((error) => {
            console.error("Error writing to CSV file:", error);
          });
      });
  })
  .catch((error) => {
    console.error("Error fetching JSON data:", error);
  });

const team_codes = {
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
  43: "Man City",
  49: "Sheffield Utd",
  54: "Fulham",
  90: "Burnley",
  91: "Bournemouth",
  94: "Brentford",
  102: "Luton",
};
