const axios = require('axios');
const { JSDOM } = require('jsdom');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

// Helper function to generate 24-hour intervals
function generate24HourIntervals() {
  const intervals = [];
  for (let hour = 0; hour < 24; hour++) {
    const startHour = hour.toString().padStart(2, '0');
    const endHour = (hour + 1) % 24;
    const endHourStr = endHour.toString().padStart(2, '0');
    
    intervals.push({
      startTime: `${startHour}:00`,
      endTime: `${endHourStr}:00`,
      status: "Inactive"
    });
  }
  return intervals;
}

// Helper function to check if a time falls within an interval
function isTimeInInterval(time, intervals) {
  for (const interval of intervals) {
    const [startTime, endTime] = interval.split('-').map(t => t.trim());
    if (time >= startTime && time < endTime) {
      return true;
    }
  }
  return false;
}

async function fetchAndParseData() {
  try {
    const response = await axios.get('http://109.87.215.193:5500/%D0%92%D1%96%D0%B4%D0%BA%D0%BB%D1%8E%D1%87%D0%B5%D0%BD%D0%BD%D1%8F%20%E2%8B%86%20%D0%A0%D1%96%D0%B2%D0%BD%D0%B5%D0%BE%D0%B1%D0%BB%D0%B5%D0%BD%D0%B5%D1%80%D0%B3%D0%BE.html', {
      httpsAgent,
    });

    const dom = new JSDOM(response.data);
    const document = dom.window.document;
    const container = document.querySelector('#fetched-data-container');
    
    if (!container) {
      throw new Error('Container #fetched-data-container not found');
    }

    const table = container.querySelector('table');
    if (!table) {
      throw new Error('Table not found');
    }

    const rows = Array.from(table.querySelectorAll('tr'));
    const title = rows[0].querySelector('td').textContent.trim();
    const subQueues = Array.from(rows[3].querySelectorAll('td')).slice(1);

    const output = [];

    // Process each date row
    for (let i = 4; i < rows.length; i++) {
      const dateRow = rows[i];
      const cells = Array.from(dateRow.querySelectorAll('td'));
      
      // Parse and format date
      const date = cells[0].textContent.trim();
      const [day, month, year] = date.split('.');
      const formattedDate = `${year}-${month}-${day}`;

      const queues = {};
      let currentQueue = null;

      // Process each subqueue
      for (let j = 0; j < subQueues.length; j++) {
        const subQueueNumber = subQueues[j].textContent.trim();
        const [mainQueue, subQueue] = subQueueNumber.split('.');
        
        if (!queues[mainQueue]) {
          queues[mainQueue] = [];
        }

        // Get time intervals for this subqueue
        const timeCell = cells[j + 1];
        const times = [];
        if (timeCell) {
          const timeParagraphs = timeCell.querySelectorAll('p');
          if (timeParagraphs.length > 0) {
            times.push(...Array.from(timeParagraphs).map(p => p.textContent.trim()).filter(t => t !== ''));
          } else if (timeCell.textContent.trim() !== 'Очікується' && timeCell.textContent.trim() !== '') {
            times.push(timeCell.textContent.trim());
          }
        }

        // Generate 24-hour intervals with status
        const intervals = generate24HourIntervals();
        
        // Update intervals based on scheduled outages
        for (let interval of intervals) {
          const timeStr = interval.startTime;
          if (times.some(t => isTimeInInterval(timeStr, [t]))) {
            interval.status = "Active";
          }
        }

        queues[mainQueue].push({
          subQueue: subQueueNumber,
          intervals: intervals
        });
      }

      output.push({
        date: formattedDate,
        queues
      });
    }

    return {
      title,
      data: output
    };
  } catch (error) {
    console.error('Error in fetchAndParseData:', error);
    throw error;
  }
}

async function storeData(result) {
  const now = new Date();
  const kyivTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const kyivDate = kyivTime.toISOString().split('T')[0];

  for (const dateData of result.data) {
    const json = JSON.stringify({
      title: result.title,
      ...dateData
    }, null, 2);

    if (dateData.date === kyivDate) {
      const latestDest = path.join(__dirname, '/outages/latest');
      await fs.mkdir(latestDest, { recursive: true });
      await fs.writeFile(path.join(latestDest, 'data.json'), json);
    }

    const historyDest = path.join(__dirname, '/outages/history', dateData.date);
    await fs.mkdir(historyDest, { recursive: true });
    await fs.writeFile(path.join(historyDest, 'data.json'), json);
  }
}

async function Main() {
  try {
    const result = await fetchAndParseData();
    await storeData(result);
    console.log('Data successfully processed and stored.');
  } catch (error) {
    console.error('Error in Main function:', error);
  }
}

Main();
