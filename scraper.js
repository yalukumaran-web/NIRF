const fs = require('fs');
const ExcelJS = require('exceljs');
const google = require('googlethis');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log("Starting script...");
    const markdown = fs.readFileSync('colleges.md', 'utf-8');
    const lines = markdown.split('\n');
    
    const colleges = [];
    for (const line of lines) {
        if (!line.startsWith('|')) continue;
        if (line.includes('Rank') || line.includes('---')) continue;
        const parts = line.split('|').map(s => s.trim());
        if (parts.length >= 3 && parts[1] && parts[2]) {
            colleges.push({
                rank: parts[1],
                name: parts[2]
            });
        }
    }
    
    console.log(`Parsed ${colleges.length} colleges.`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('NIRF 2025 Engineering');

    worksheet.columns = [
        { header: 'Rank', key: 'rank', width: 10 },
        { header: 'College Name', key: 'name', width: 50 },
        { header: 'PDF Link', key: 'link', width: 60 },
        { header: 'Status/Notes', key: 'status', width: 40 }
    ];

    const options = {
        page: 0, 
        safe: false, // Safe Search
        parse_ads: false, 
        additional_params: {
            hl: 'en'
        }
    };

    for (let i = 0; i < colleges.length; i++) {
        const c = colleges[i];
        console.log(`[${i+1}/${colleges.length}] Processing ${c.name}...`);
        
        let pdfLink = "Not available";
        let status = "Not found";

        try {
            // First try to find a direct PDF link
            let query = `"${c.name}" "NIRF" 2025 "Engineering" filetype:pdf`;
            let response = await google.search(query, options);
            
            if (response.results && response.results.length > 0) {
                pdfLink = response.results[0].url;
                status = "PDF found";
            } else {
                // Try searching without filetype:pdf to find the NIRF page
                await delay(1500); // Wait before next query
                query = `"${c.name}" "NIRF" 2025 "Engineering" OR "NIRF Ranking"`;
                response = await google.search(query, options);
                
                if (response.results && response.results.length > 0) {
                    pdfLink = response.results[0].url;
                    status = "Page found (Direct PDF not available in search)";
                }
            }
        } catch (e) {
            console.error(`Error searching for ${c.name}:`, e.message);
            status = "Search error or Rate limited";
        }
        
        worksheet.addRow({
            rank: c.rank,
            name: c.name,
            link: pdfLink,
            status: status
        });
        
        // Wait to avoid rate limiting
        await delay(3000);
        
        // Save progress every 10 items
        if ((i + 1) % 10 === 0) {
            await workbook.xlsx.writeFile('NIRF_2025_Engineering_Top100.xlsx');
            console.log(`Saved progress up to ${i+1}.`);
        }
    }

    await workbook.xlsx.writeFile('NIRF_2025_Engineering_Top100.xlsx');
    console.log("Done! File saved as NIRF_2025_Engineering_Top100.xlsx");
}

run().catch(console.error);
