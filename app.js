const express = require("express");
const fs = require("fs"); // Import the 'fs' module for file system operations
const path = require("path");

const app = express();
const port = 3001;

// Serve the code_dict.csv file and display in browser
app.get("/code_dict.csv", (req, res) => {
  const filePath = path.join(__dirname, "code_dict.csv");

  fs.readFile(filePath, "utf8", (err, data) => {
    // Read the CSV file
    if (err) {
      console.error(err);
      res.status(500).send("Error reading CSV file");
      return;
    }

    res.set("Content-Type", "text/plain"); // Set the content type to plain text
    res.send(data); // Send the CSV data as the response
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
