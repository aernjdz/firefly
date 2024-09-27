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
    const response = await axios.get('https://www.roe.vsei.ua/disconnections', {
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
    if (rows.length < 4) {
      throw new Error(`Expected at least 4 rows, but found ${rows.length}`);
    }
    const titleRow = rows[0];
    const headerRow = rows[2];
    const dateRows = Array.from(rows).slice(3);
    const title = titleRow.textContent.trim();
    const output = [];

    for (const dateRow of dateRows) {
      const date = dateRow.querySelector('td').textContent.trim();
      const dateParts = date.split('.');
      const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
      const queueCells = headerRow.querySelectorAll('td');
      const timeCells = dateRow.querySelectorAll('td');
      const dayData = [];

      for (let i = 0; i < queueCells.length; i++) {
        const queueText = queueCells[i].textContent.trim();
        const queue = queueText.match(/№\s*\d+/)[0];
       
        let times = [];
        if (i < timeCells.length) {
          const timeCell = timeCells[i+1];
          if (timeCell.textContent.trim() === 'Очікується') {
            times = [];
          } else {
            const timeParagraphs = timeCell.querySelectorAll('p');
            times = Array.from(timeParagraphs).map(p => p.textContent.trim()).filter(t => t !== '');
            if (times.length === 0) {
              times = [timeCell.textContent.trim()];
            }
          }
        }
        dayData.push({ queue: queue[2], times });
      }

      output.push({
        date: formattedDate,
        data: dayData
      });
    }

    return {
      title,
      dates: output,
    };
  } catch (error) {
    console.error('Detailed error in fetchAndParseData:', error);
    console.error('HTML content:', htmlContent);
    throw new Error('Error fetching or parsing the data: ' + error.message);
  }
}

async function storeData(result) {
  const now = new Date();
  const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const kyivDate = kyivTime.toISOString().split('T')[0];

  for (const dateData of result.dates) {
    const json = JSON.stringify({ title: result.title, ...dateData }, null, 4);
    
    if (dateData.date === kyivDate) {
      const latestDest = path.join(__dirname, '/outages/latest');
      await fs.mkdir(latestDest, { recursive: true });
      await fs.writeFile(path.join(latestDest, `data.json`), json);
    }
    
    const historyDest = path.join(__dirname, '/outages/history', dateData.date);
    await fs.mkdir(historyDest, { recursive: true });
    await fs.writeFile(path.join(historyDest, `data.json`), json);
  }
}
<<<<<<< HEAD

async function Main() {
  try {
    const result = await fetchAndParseData();
    await storeData(result);
    console.log('Data successfully fetched and stored.');
    console.log('Parsed data:', JSON.stringify(result, null, 4));
  } catch (error) {
    console.error('Error in Main function:', error);
  }
}

Main();
