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
  const response = await axios.get('http://109.87.215.193:5500/%D0%92%D1%96%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%BD%D1%8F%20%E2%8B%86%20%D0%A0%D1%96%D0%B2%D0%BD%D0%B5%D0%BE%D0%B1%D0%BB%D0%B5%D0%BD%D0%B5%D1%80%D0%B3%D0%BE.html', {
      httpsAgent,
    });
    // const response = await axios.get('https://www.roe.vsei.ua/disconnections', {
    //   httpsAgent,
    // });
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

    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 4) {
      throw new Error(`Expected at least 4 rows, but found ${rows.length}`);
    }

    // Get title from the first row
    const title = rows[0].querySelector('td').textContent.trim();
    
    // Get queue numbers from the third row (queue headers)
    const queueHeaders = Array.from(rows[2].querySelectorAll('td'));
    
    // Get sub-queue numbers from the fourth row
    const subQueueRow = rows[3];
    const subQueues = Array.from(subQueueRow.querySelectorAll('td')).slice(1); // Skip first column (label)

    const output = [];

    // Process data rows (starting from index 4)
    for (let i = 4; i < rows.length; i++) {
      const dateRow = rows[i];
      const cells = Array.from(dateRow.querySelectorAll('td'));
      
      // Get date from first cell
      const dateCell = cells[0];
      const date = dateCell.textContent.trim();
      const dateParts = date.split('.');
      if (dateParts.length !== 3) {
        console.warn(`Invalid date format: ${date}`);
        continue;
      }
      const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      // Process queue data
      const queues = {};
      let currentQueue = null;
      
      // Skip first cell (date) and process time slots
      for (let j = 1; j < cells.length; j++) {
        const subQueueNumber = subQueues[j - 1].textContent.trim();
        const [mainQueue, subQueue] = subQueueNumber.split('.');
        
        if (!queues[mainQueue]) {
          queues[mainQueue] = [];
        }

        // Parse time slots
        const timeCell = cells[j];
        let times = [];
        
        if (timeCell.textContent.trim() === 'Очікується') {
          times = [];
        } else {
          // Process time ranges
          const timeText = timeCell.textContent.trim();
          times = timeText.split(/\s+/)
            .filter(t => t.includes('-'))
            .map(t => t.replace(/\s+/g, ''));
        }

        queues[mainQueue].push({
          name_queue: subQueueNumber,
          times,
        });
      }

      output.push({
        date: formattedDate,
        queues,
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
