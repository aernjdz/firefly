 // Підключаємо node-fetch
const XLSX = require('xlsx');         // Підключаємо бібліотеку XLSX
const fs = require('fs');             // Підключаємо модуль для роботи з файлами

// Ігнорування перевірки сертифікатів (для тестування)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const url = 'https://www.roe.vsei.ua/wp-content/uploads/2024/09/planovi-23.09.2024.xlsx';

fetch(url)
  .then(response => response.arrayBuffer())
  .then(data => {
    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Збереження даних у JSON-файл
    fs.writeFile('output.json', JSON.stringify(jsonData, null, 2), (err) => {
      if (err) {
        console.error('Помилка під час збереження JSON-файлу:', err);
      } else {
        console.log('Дані успішно збережені в output.json');
      }
    });
  })
  .catch(error => {
    console.error('Помилка під час завантаження файлу:', error);
  });
