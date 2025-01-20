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
      
      // Skip first cell (date) and process time slots
      for (let j = 0; j < subQueues.length; j++) {
        const subQueueNumber = subQueues[j].textContent.trim();
        const [mainQueue, subQueue] = subQueueNumber.split('.');
        
        if (!queues[mainQueue]) {
          queues[mainQueue] = [];
        }

        let times = [];
        if (j + 1 < cells.length) {
          const timeCell = cells[j + 1];
          if (timeCell.textContent.trim() === 'Очікується' || timeCell.textContent.trim() === "") {
            times = [];
          } else {
            const timeParagraphs = timeCell.querySelectorAll('p');
            times = Array.from(timeParagraphs).map(p => p.textContent.trim()).filter(t => t !== '');
            if (times.length === 0) {
              times = [timeCell.textContent.trim()];
            }
          }
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

function generateV2Format(originalData) {
  const output = [];

  for (const dateData of originalData.dates) {
    const queues = {};
    
    // Process each queue
    for (const [queueNum, subQueuesData] of Object.entries(dateData.queues)) {
      queues[queueNum] = subQueuesData.map(subQueue => {
        // Generate 24-hour intervals
        const intervals = [];
        for (let hour = 0; hour < 24; hour++) {
          const startHour = hour.toString().padStart(2, '0');
          const endHour = (hour + 1) % 24;
          const endHourStr = endHour.toString().padStart(2, '0');
          
          const timeStr = `${startHour}:00`;
          const status = subQueue.times.some(interval => {
            const [start, end] = interval.split('-').map(t => t.trim());
            return timeStr >= start && timeStr < end;
          }) ? "Active" : "Inactive";

          intervals.push({
            startTime: `${startHour}:00`,
            endTime: `${endHourStr}:00`,
            status
          });
        }

        return {
          subQueue: subQueue.name_queue,
          intervals
        };
      });
    }

    output.push({
      date: dateData.date,
      queues
    });
  }

  return {
    title: originalData.title,
    data: output
  };
}

async function storeData(result) {
  const now = new Date();
  const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const kyivDate = kyivTime.toISOString().split('T')[0];

  // Generate v2 format data
  const v2Data = generateV2Format(result);

  for (const dateData of result.dates) {
    // Store original format
    const originalJson = JSON.stringify({ title: result.title, ...dateData }, null, 2);

    // Find corresponding v2 data
    const v2DateData = v2Data.data.find(d => d.date === dateData.date);
    const v2Json = JSON.stringify({ title: v2Data.title, ...v2DateData }, null, 2);

    if (dateData.date === kyivDate) {
      const latestDest = path.join(__dirname, '/outages/latest');
      await fs.mkdir(latestDest, { recursive: true });
      // Save both formats
      await fs.writeFile(path.join(latestDest, 'data.json'), originalJson);
      await fs.writeFile(path.join(latestDest, 'data_v2.json'), v2Json);
    }

    const historyDest = path.join(__dirname, '/outages/history', dateData.date);
    await fs.mkdir(historyDest, { recursive: true });
    // Save both formats
    await fs.writeFile(path.join(historyDest, 'data.json'), originalJson);
    await fs.writeFile(path.join(historyDest, 'data_v2.json'), v2Json);
  }
}

async function Main() {
  try {
    const result = await fetchAndParseData();
    await storeData(result);
    console.log('Data successfully processed and stored in both formats.');
  } catch (error) {
    console.error('Error in Main function:', error);
  }
}

// Run the script
Main();
