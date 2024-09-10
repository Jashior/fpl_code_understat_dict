const express = require("express");
const fs = require("fs"); // Import the 'fs' module for file system operations
const path = require("path");

const app = express();
const port = 3001;

// Serve the code_dict.csv file and display in browser
app.get("/code_dict.csv", (req, res) => {
  const filePath = path.join(__dirname, "code_dict.csv");
  // Read the file synchronously on each request
  try {
    const data = fs.readFileSync(filePath, "utf8");
    res.set("Content-Type", "text/plain");
    res.set("Cache-Control", "public, max-age=600");
    res.send(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error reading CSV file");
  }
});

// Basic route for the root path "/"
app.get("/", (req, res) => {
  res.send("Welcome to the FPL code dictionary CSV server!");
});

// Start the server
app.listen(port, () => {
  console.log(`Started. Server listening on port ${port}`);
});
