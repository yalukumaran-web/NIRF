const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const response = await axios.get('https://www.nirfindia.org/Rankings/2025/Engineering', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        const table = $('#tbl_overall');
        
        if (table.length === 0) {
            console.log('Table not found');
            return;
        }

        const headers = [];
        table.find('thead th').each((i, el) => {
            headers.push($(el).text().trim());
        });
        console.log('Headers:', headers);

        const firstRow = [];
        table.find('tbody tr').first().find('td').each((i, el) => {
            firstRow.push($(el).text().trim());
        });
        console.log('First row:', firstRow);

    } catch (e) {
        console.error(e);
    }
}
test();
