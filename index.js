
const axios = require('axios');
const { JSDOM } = require('jsdom');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { fileURLToPath } = require('url');



const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function fetchAndParseData() {
  const output = [];
  try {
    const response = await axios.get('https://www.roe.vsei.ua/disconnections', {
      httpsAgent, 
    });
    const htmlContent = response.data;
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    const table = document.querySelector('#fetched-data-container table');

    if (table) {
      const rows = table.querySelectorAll('tr');
      const thirdRow = rows[2];
      const fourthRow = rows[3];

      for (let i = 0; i < 6; i++) {
        const thirdRowColumn = thirdRow.querySelectorAll('td')[i].textContent.trim();
        const fourthRowColumn = fourthRow.querySelectorAll('td')[i + 1].textContent.trim().split(",");
        output.push({ queue: thirdRowColumn, time: fourthRowColumn });
      }
      return {
        date: fourthRow.querySelectorAll('td')[0].textContent.trim(),
        data: output,
      };
    } else {
      throw new Error('Table not found');
    }
  } catch (error) {
    throw new Error('Error fetching or parsing the data: ' + error.message);
  }
}

async function storeData(table, date) {

  const json = JSON.stringify({ date: date, data: table });
  const diskOperations = ['latest', `history/${date}`].map(async (dir) => {
    const dest = path.join(__dirname, '/outages', dir);
    await fs.mkdir(dest, { recursive: true });
    await fs.writeFile(path.join(dest, `data.json`), json);
   

  });
  return Promise.all(diskOperations);
}

 async function Main(){
  try {
    const result = await fetchAndParseData();
    await storeData(result.data,result.date); 
  } catch (error) {
    console.log(error)
  }
}

