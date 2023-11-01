const express = require("express");
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const OpenIdClient = require("openid-client");

const PORT = process.env.PORT || 3001;

const app = express();

app.use(express.static(path.resolve(__dirname, '../client/build')));

let accessToken;
let primaryKey;
let clientId;
let clientSecret;
let IdentityUrl;
let TargetIdentityUrl;
let TargetclientId;
let TargetclientSecret;
let sourceURL;
let targetURL;
let selectedSource;
let selectedMissingFrom;
let selectedItem;
let sourceOutputFileName;
let targetOutputFileName;
let DifferenceFileName;

const credentialsScope = "openid microprofile-jwt";
const excludedKeys = ["@odata.etag", "luname", "keyref"];

let jsonData;
try {
  jsonData = require('./Auth.json');
} catch (err) {
  console.error('Error loading JSON file:', err);
}

let jsonFormat;
try {
  jsonFormat = require('./Config.json');
} catch (err) {
  console.error('Error loading JSON file:', err);
}

app.get('/api/index', async (req, res) => {
    let differences;
    try{
        selectedSource = req.query.source;
    selectedMissingFrom = req.query.missingFrom;
    selectedItem = req.query.item;

    sourceOutputFileName = `./${selectedItem}_${selectedSource}.json`;
    targetOutputFileName = `./${selectedItem}_${selectedMissingFrom}.json`;
    DifferenceFileName = `./Diff_${selectedItem}_${selectedSource}_${selectedMissingFrom}.json`;

    console.log(`Starting the server for resource: ${selectedSource}, ${selectedMissingFrom}, ${selectedItem}`);

    if (jsonData.hasOwnProperty(selectedSource) && jsonData.hasOwnProperty(selectedMissingFrom)) {
      const environmentData = jsonData[selectedSource];
      const TargetenvironmentData = jsonData[selectedMissingFrom];

      IdentityUrl = environmentData.IdentityUrl;
      clientId = environmentData.ClientId;
      clientSecret = environmentData.ClientSecret;
      TargetIdentityUrl = TargetenvironmentData.IdentityUrl;
      TargetclientId = TargetenvironmentData.ClientId;
      TargetclientSecret = TargetenvironmentData.ClientSecret;

      if (jsonFormat.Projection.hasOwnProperty(selectedItem)) {
        const itemData = jsonFormat.Projection[selectedItem];
        primaryKey = itemData.PrimaryKey;

        sourceURL = getProjectionUrl(itemData, selectedSource);
        targetURL = getProjectionUrl(itemData, selectedMissingFrom);

         await makeSourceGetRequest(sourceURL);
         await makeTargetGetRequest(targetURL);

        const sourceData = JSON.parse(fs.readFileSync(sourceOutputFileName, 'utf-8'));
        const targetData = JSON.parse(fs.readFileSync(targetOutputFileName, 'utf-8'));

        const objKeysToExclude = sourceData.value
        .reduce((keys, item) => {
          for (const key in item) {
            if (key.startsWith("Obj")) {
              keys.push(key);
            }
          }
          return keys;
        }, []);
      excludedKeys.push(...objKeysToExclude);

        differences = compareJSON(sourceData.value, targetData.value, primaryKey);
        // fs.writeFileSync(DifferenceFileName, JSON.stringify(differences, null, 2), 'utf-8');
        // console.log(`${DifferenceFileName} written successfully\n`);
        console.log(differences);
        //return [{ data:differences }];
        // res.setHeader('Content-Type', 'application/json');
        // res.send({ "name":"Rochak" }); // Send differences as a response
      //  res.status(200).json({ error: "Environment not found" });
      } else {
        console.log("Item not found.");
        res.status(404).json({ error: "Item not found" });
      }
    } else {
      console.log("Environment not found.");
      res.status(404).json({ error: "Environment not found" });
    }
    }
     catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred" });
  }
    res.json({ data: differences });
  });


//   app.get('*', (req, res) => {
//     res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
//   });

async function makeSourceGetRequest(sourceURL) {
    const issuer = await OpenIdClient.Issuer.discover(IdentityUrl);
    const client = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret
    });
  
    const grantResponse = await client.grant({
      grant_type: 'client_credentials',
      scope: credentialsScope
    });
  
    accessToken = grantResponse.access_token;
  
    const response = await axios.get(sourceURL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  
    const result = response.data;
    const obj = JSON.parse(JSON.stringify(result));
  
    return new Promise((resolve, reject) => {
      // Check if the original file exists, if so, create a backup with a timestamp
      if (fs.existsSync(sourceOutputFileName)) {
        createBackupFile(sourceOutputFileName);
      }
  
      fs.writeFile(sourceOutputFileName, JSON.stringify(obj), (err) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          console.log(`${sourceOutputFileName} written successfully\n`);
          resolve();
        }
      });
    });
  }


  async function makeTargetGetRequest(targetURL) {
    const issuer = await OpenIdClient.Issuer.discover(TargetIdentityUrl);
    const client = new issuer.Client({
      client_id: TargetclientId,
      client_secret: TargetclientSecret
    });
  
    const grantResponse = await client.grant({
      grant_type: 'client_credentials',
      scope: credentialsScope
    });
  
    accessToken = grantResponse.access_token;
  
    const response = await axios.get(targetURL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  
    const result = response.data;
    const obj = JSON.parse(JSON.stringify(result));
  
    return new Promise((resolve, reject) => {
      // Check if the original file exists, if so, create a backup with a timestamp
      if (fs.existsSync(targetOutputFileName)) {
        createBackupFile(targetOutputFileName);
      }
  
      fs.writeFile(targetOutputFileName, JSON.stringify(obj), (err) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          console.log(`${targetOutputFileName} written successfully\n`);
          resolve();
        }
      });
    });
  }
  
  // Function to create backup file with a timestamp
  function createBackupFile(fileName) {
    const originalFileName = fileName;
    const now = new Date();
    const backupFileName = `${originalFileName}_backup.json`;
    fs.renameSync(originalFileName, backupFileName);
    console.log(`Backup created: ${backupFileName}`);
  }
  
  function getProjectionUrl(itemData, selectedEnv) {
    if (selectedEnv === 'CFG Environment') {
      return itemData.ProjectionUrlCfg;
    } else if (selectedEnv === 'ACC Environment') {
      return itemData.ProjectionUrlAcc;
    } else {
      return itemData.ProjectionUrlUat;
    }
  }


  
  function compareJSON(source, target, primaryKey) {
    const differences = [];


  
    // Create a map for easier access to source data
    const sourceMap = new Map(source.map(item => [primaryKey.map(key => item[key]).join(' | '), item]));
    const targetMap = new Map(target.map(item => [primaryKey.map(key => item[key]).join(' | '), item]));
  
    // Helper function to filter out excluded keys
    function filterExcludedKeys(obj) {
      const filtered = { ...obj };
      for (const key of excludedKeys) {
        delete filtered[key];
      }
      return filtered;
    }
  
    // Iterate over source data to find missing records in target
    for (const sourceItem of source) {
      const primaryKeyValues = primaryKey.map(key => sourceItem[key]);
      const primaryKeysData = primaryKey.map(key => ({ key: key, value: sourceItem[key] }));
      const primaryKeyValue = primaryKeyValues.join(' | ');
      if (!targetMap.has(primaryKeyValue)) {
        differences.push({
          primaryKeyValue: primaryKeysData,
          ...filterExcludedKeys(sourceItem),
          Source: `${selectedSource}`,
          MissingFrom: `${selectedMissingFrom}`
        });
      }
    }
  
    // Iterate over target data to find missing records in source and differences
    for (const targetItem of target) {
      const primaryKeyValues = primaryKey.map(key => targetItem[key]);
      const primaryKeysData = primaryKey.map(key => ({ key: key, value: targetItem[key] }));
      const primaryKeyValue = primaryKeyValues.join(' | ');
      const sourceItem = sourceMap.get(primaryKeyValue);
  
      if (!sourceItem) {
        differences.push({
          primaryKeyValue: primaryKeysData,
          ...filterExcludedKeys(targetItem),
          Source: `${selectedMissingFrom}`,
          MissingFrom: `${selectedSource}`
          
        });
      } else {
        // Compare other keys
        const differingKeys = {};
  
        for (const key in targetItem) {
          if (!excludedKeys.includes(key) && targetItem[key] !== sourceItem[key]) {
            differingKeys[key] = {
              [selectedSource]: sourceItem[key],
              [selectedMissingFrom]: targetItem[key]
            };
          }
        }
  
        if (Object.keys(differingKeys).length > 0) {
          differences.push({
            primaryKeyValue: primaryKeysData,
            differences: differingKeys
          });
        }
      }
    }
  
    return differences;
  }

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});