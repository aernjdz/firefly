const axios = require('axios');
const { JSDOM } = require('jsdom');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function fetchAndParseData() {
  let htmlContent = '';
  try {
    const response = await axios.get('http://37.57.175.23:3000/', {
      httpsAgent,
    });
    htmlContent = response.data;
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    const container = document.querySelector('#fetched-data-container');

    if (!container) {
      throw new Error('Container #fetched-data-container not found');
    }

    const table = container.querySelector('table');

    if (!table) {
      throw new Error('Table not found within #fetched-data-container');
    }

    const rows = table.querySelectorAll('tr');

    if (rows.length < 2) {
      throw new Error(`Expected at least 2 rows, but found ${rows.length}`);
    }

    // Find the date row (assuming it's the last row with a single cell spanning all columns)
    let dateRow;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].querySelectorAll('td').length === 1) {
        dateRow = rows[i];
        break;
      }
    }

    if (!dateRow) {
      throw new Error('Date row not found');
    }

    const date = dateRow.querySelector('td').textContent.trim();

    // Find the data row (assuming it's the last row with multiple cells)
    let dataRow;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].querySelectorAll('td').length > 1) {
        dataRow = rows[i];
        break;
      }
    }

    if (!dataRow) {
      throw new Error('Data row not found');
    }

    const output = [];
    const dataCells = dataRow.querySelectorAll('td');

    for (let i = 0; i < dataCells.length; i++) {
      const queueCell = dataCells[i];
      const queue = `№ ${i + 1}`;
      let times = [];

      if (queueCell.textContent.trim() === 'Очікується') {
        times = [];
      } else {
        const timeParagraphs = queueCell.querySelectorAll('p');
        times = Array.from(timeParagraphs).map(p => p.textContent.trim());
        if (times.length === 0) {
          // If no <p> tags, use the cell's text content
          times = [queueCell.textContent.trim()];
        }
      }

      output.push({ queue, times });
    }

    return {
      date,
      data: output,
    };
  } catch (error) {
    console.error('Detailed error in fetchAndParseData:', error);
    console.error('HTML content:', htmlContent);
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

async function Main() {
  try {
    const result = await fetchAndParseData();
    await storeData(result.data, result.date);
    console.log('Data successfully fetched and stored.');
    console.log('Parsed data:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error in Main function:', error);
  }
}

Main();