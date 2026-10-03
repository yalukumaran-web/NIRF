const axios = require('axios');
const cheerio = require('cheerio');

async function searchDDG(query) {
    try {
        const res = await axios.post('https://html.duckduckgo.com/html/', `q=${encodeURIComponent(query)}`, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        const $ = cheerio.load(res.data);
        const results = [];
        $('.result__url').each((i, el) => {
            const url = $(el).attr('href');
            if(url) {
                // The URL is usually something like //duckduckgo.com/l/?uddg=...
                const match = url.match(/uddg=([^&]+)/);
                if (match) {
                    results.push(decodeURIComponent(match[1]));
                }
            }
        });
        return results;
    } catch(e) {
        console.error("DDG Search Error:", e.message);
        return [];
    }
}

searchDDG('"Indian Institute of Technology Madras" NIRF 2025 Engineering filetype:pdf').then(res => {
    console.log("PDF Links:", res);
});
