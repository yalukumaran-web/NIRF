const google = require('googlethis');

async function test() {
    console.log("Testing PDF...");
    let response = await google.search('"Indian Institute of Technology Madras" "NIRF" 2025 "Engineering" filetype:pdf', { safe: false, parse_ads: false });
    console.log("PDF Search Results:", response.results.length);
    if(response.results.length > 0) console.log(response.results[0].url);

    console.log("Testing General...");
    response = await google.search('"Indian Institute of Technology Madras" "NIRF" 2025 "Engineering" OR "NIRF Ranking"', { safe: false, parse_ads: false });
    console.log("General Search Results:", response.results.length);
    if(response.results.length > 0) console.log(response.results[0].url);
}
test().catch(console.error);
